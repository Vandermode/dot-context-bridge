import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { spawn } from "node:child_process";
import test from "node:test";

import { terminateAppServerChild } from "../src/app-server.js";
import {
  DARWIN_PLATFORM_POLICY,
  LINUX_PLATFORM_POLICY,
  createWindowsPlatformPolicy,
  platformPolicyFor,
  type ManagedChildProcess,
  type WindowsTaskkillRunner,
} from "../src/platform.js";
import { TOOL_DEFINITIONS } from "../src/tools.js";

test("Windows, Darwin and Linux cwd policies are explicit peers", () => {
  const windows = createWindowsPlatformPolicy(() => ({ status: 0 }));
  assert.equal(windows.validateCwd("D:/Bridge/project"), "D:\\Bridge\\project");
  assert.throws(() => windows.validateCwd("relative\\path"), /drive-letter/);
  assert.throws(() => windows.validateCwd("\\\\server\\share"), /UNC or Windows device/);
  assert.throws(() => windows.validateCwd("\\\\?\\D:\\Bridge"), /UNC or Windows device/);

  assert.equal(
    DARWIN_PLATFORM_POLICY.validateCwd("/Users/example/../bridge"),
    "/Users/bridge",
  );
  assert.throws(
    () => DARWIN_PLATFORM_POLICY.validateCwd("Users/example/bridge"),
    /absolute POSIX path on macOS/,
  );
  assert.equal(LINUX_PLATFORM_POLICY.validateCwd("/home/example/../project with spaces"), "/home/project with spaces");
  for (const invalid of ["relative/path", "C:\\project", "~/project", ""]) {
    assert.throws(() => LINUX_PLATFORM_POLICY.validateCwd(invalid), /absolute POSIX path on Linux/);
  }
  assert.throws(() => LINUX_PLATFORM_POLICY.validateCwd("/home/invalid\0path"), /NUL/);
});

test("Linux checkpoint paths honor absolute XDG state home and otherwise use the Linux home", () => {
  const linux = LINUX_PLATFORM_POLICY;
  assert.equal(linux.resolveDefaultCheckpointDirectory({ XDG_STATE_HOME: "/state with spaces" }, "/home/example"),
    "/state with spaces/LocalCodexBridge/checkpoints");
  for (const value of [undefined, "", "relative", "~/state", "/bad\0path"]) {
    const env: NodeJS.ProcessEnv = value === undefined ? {} : { XDG_STATE_HOME: value };
    assert.equal(linux.resolveDefaultCheckpointDirectory(env, "/home/example"),
      "/home/example/.local/state/LocalCodexBridge/checkpoints");
  }
  for (const home of ["relative", "", "/bad\0path"]) {
    assert.throws(() => linux.resolveDefaultCheckpointDirectory({}, home), /absolute Linux home/);
  }
  assert.equal(linux.normalizeExplicitCheckpointDirectory("/state/../checkpoints"), "/checkpoints");
  assert.throws(() => linux.normalizeExplicitCheckpointDirectory("relative"), /absolute POSIX path on Linux/);
  assert.throws(() => linux.normalizeExplicitCheckpointDirectory("/bad\0path"), /NUL/);
});

test("checkpoint defaults remain platform-native and Windows alone preserves its legacy default", () => {
  const canonicalWindows = createWindowsPlatformPolicy(
    () => ({ status: 0 }),
    () => false,
  );
  assert.equal(
    canonicalWindows.resolveDefaultCheckpointDirectory(
      { LOCALAPPDATA: "D:\\Local" },
      "D:\\Users\\Example",
    ),
    "D:\\Local\\LocalCodexBridge\\checkpoints",
  );

  const legacyPath = "D:\\Local\\Lumen\\CodexControlV2\\checkpoints";
  const legacyWindows = createWindowsPlatformPolicy(
    () => ({ status: 0 }),
    (candidate) => candidate === legacyPath,
  );
  assert.equal(
    legacyWindows.resolveDefaultCheckpointDirectory(
      { LOCALAPPDATA: "D:\\Local" },
      "D:\\Users\\Example",
    ),
    legacyPath,
  );

  assert.equal(
    DARWIN_PLATFORM_POLICY.resolveDefaultCheckpointDirectory(
      { LOCALAPPDATA: "D:\\must-not-be-used" },
      "/Users/example",
    ),
    "/Users/example/Library/Application Support/LocalCodexBridge/checkpoints",
  );
});

test("spawn and termination mechanisms stay platform-specific", () => {
  const invocations: Array<{
    executable: string;
    args: readonly string[];
    shell: unknown;
    windowsHide: unknown;
  }> = [];
  const runner: WindowsTaskkillRunner = (executable, args, options) => {
    invocations.push({
      executable,
      args: [...args],
      shell: options.shell,
      windowsHide: options.windowsHide,
    });
    return { status: 0 };
  };
  const windows = createWindowsPlatformPolicy(runner);
  const windowsSignals: Array<NodeJS.Signals | number | undefined> = [];
  const windowsChild: ManagedChildProcess = {
    pid: 4242,
    exitCode: null,
    signalCode: null,
    kill: (signal) => {
      windowsSignals.push(signal);
      return true;
    },
  };
  windows.softTerminateChild(windowsChild);
  windows.hardTerminateChild(windowsChild);
  assert.deepEqual(windowsSignals, [undefined]);
  assert.deepEqual(invocations, [{
    executable: "taskkill.exe",
    args: ["/PID", "4242", "/T", "/F"],
    shell: false,
    windowsHide: true,
  }]);
  assert.deepEqual(windows.appServerSpawnOptions(), {
    shell: false,
    windowsHide: true,
  });

  const darwinSignals: Array<NodeJS.Signals | number | undefined> = [];
  const darwinChild: ManagedChildProcess = {
    pid: 5252,
    exitCode: null,
    signalCode: null,
    kill: (signal) => {
      darwinSignals.push(signal);
      return true;
    },
  };
  DARWIN_PLATFORM_POLICY.softTerminateChild(darwinChild);
  DARWIN_PLATFORM_POLICY.hardTerminateChild(darwinChild);
  assert.deepEqual(darwinSignals, ["SIGTERM", "SIGKILL"]);
  assert.deepEqual(DARWIN_PLATFORM_POLICY.appServerSpawnOptions(), {
    shell: false,
  });
  darwinSignals.length = 0;
  LINUX_PLATFORM_POLICY.softTerminateChild(darwinChild);
  LINUX_PLATFORM_POLICY.hardTerminateChild(darwinChild);
  assert.deepEqual(darwinSignals, ["SIGTERM", "SIGKILL"]);
  assert.deepEqual(LINUX_PLATFORM_POLICY.appServerSpawnOptions(), { shell: false });
});

test("unsupported platforms fail clearly and cwd tool schema wording stays native", () => {
  assert.equal(platformPolicyFor("linux"), LINUX_PLATFORM_POLICY);
  assert.throws(() => platformPolicyFor("freebsd"), /Unsupported platform freebsd/);
  for (const toolName of ["codex_threads"]) {
    const tool = TOOL_DEFINITIONS.find(({ name }) => name === toolName);
    const properties = tool?.inputSchema.properties as
      | Record<string, Record<string, unknown>>
      | undefined;
    const description = String(properties?.cwd?.description ?? "");
    assert.match(description, /absolute native cwd/i);
    assert.doesNotMatch(description, /Windows|macOS|POSIX/);
  }
});

test("shared child shutdown escalates in order and verifies exit after hard termination", async () => {
  const events: string[] = [];
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    stdin: { end(): void };
    kill(signal?: NodeJS.Signals | number): boolean;
  };
  child.pid = 6262;
  child.exitCode = null;
  child.signalCode = null;
  child.stdin = { end: () => events.push("graceful") };
  child.kill = () => true;

  const policy = {
    ...DARWIN_PLATFORM_POLICY,
    hasChildExited: (candidate: ManagedChildProcess) =>
      candidate.exitCode !== null || candidate.signalCode !== null,
    softTerminateChild: () => events.push("soft"),
    hardTerminateChild: () => {
      events.push("hard");
      child.exitCode = 137;
      child.emit("exit", 137, null);
    },
  };

  await terminateAppServerChild(
    child as never,
    policy,
    { gracefulMs: 1, softMs: 1, hardMs: 10 },
  );
  assert.deepEqual(events, ["graceful", "soft", "hard"]);
  assert.equal(policy.hasChildExited(child), true);
});

test("Linux tracked-child shutdown escalates to SIGKILL when EOF and SIGTERM are ignored", {
  skip: process.platform !== "linux",
  timeout: 5000,
}, async () => {
  const child = spawn(process.execPath, ["-e", `
    process.on('SIGTERM', () => {});
    process.stdin.resume();
    setInterval(() => {}, 1000);
    process.stdout.write('ready');
  `], { ...LINUX_PLATFORM_POLICY.appServerSpawnOptions(), stdio: ["pipe", "pipe", "pipe"] });
  try {
    await once(child.stdout, "data");
    await terminateAppServerChild(child, LINUX_PLATFORM_POLICY, { gracefulMs: 20, softMs: 20, hardMs: 1000 });
    assert.equal(child.signalCode, "SIGKILL");
    assert.equal(LINUX_PLATFORM_POLICY.hasChildExited(child), true);
  } finally {
    if (!LINUX_PLATFORM_POLICY.hasChildExited(child)) {
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
  }
});

test("shutdown rechecks prevent soft and hard escalation after a newly observed exit", async (t) => {
  const createChild = (events: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
      stdin: { end(): void };
      kill(signal?: NodeJS.Signals | number): boolean;
    };
    child.pid = 6767;
    child.exitCode = null;
    child.signalCode = null;
    child.stdin = { end: () => events.push("graceful") };
    child.kill = () => true;
    return child;
  };

  await t.test("pre-soft recheck", async () => {
    const events: string[] = [];
    const child = createChild(events);
    let exitChecks = 0;
    const policy = {
      ...DARWIN_PLATFORM_POLICY,
      hasChildExited: () => ++exitChecks === 3,
      softTerminateChild: () => events.push("soft"),
      hardTerminateChild: () => events.push("hard"),
    };

    await terminateAppServerChild(
      child as never,
      policy,
      { gracefulMs: 1, softMs: 1, hardMs: 1 },
    );
    assert.equal(exitChecks, 3);
    assert.deepEqual(events, ["graceful"]);
  });

  await t.test("pre-hard recheck", async () => {
    const events: string[] = [];
    const child = createChild(events);
    let exitChecks = 0;
    const policy = {
      ...DARWIN_PLATFORM_POLICY,
      hasChildExited: () => ++exitChecks === 5,
      softTerminateChild: () => events.push("soft"),
      hardTerminateChild: () => events.push("hard"),
    };

    await terminateAppServerChild(
      child as never,
      policy,
      { gracefulMs: 1, softMs: 1, hardMs: 1 },
    );
    assert.equal(exitChecks, 5);
    assert.deepEqual(events, ["graceful", "soft"]);
  });
});

test("hard-termination command failure is followed by tracked-child exit verification", async () => {
  const events: string[] = [];
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    stdin: { end(): void };
    kill(signal?: NodeJS.Signals | number): boolean;
  };
  child.pid = 7272;
  child.exitCode = null;
  child.signalCode = null;
  child.stdin = { end: () => events.push("graceful") };
  child.kill = () => true;

  const policy = {
    ...DARWIN_PLATFORM_POLICY,
    hasChildExited: (candidate: ManagedChildProcess) =>
      candidate.exitCode !== null || candidate.signalCode !== null,
    softTerminateChild: () => events.push("soft"),
    hardTerminateChild: () => {
      events.push("hard-failed");
      queueMicrotask(() => {
        child.exitCode = 1;
        child.emit("exit", 1, null);
      });
      throw new Error("synthetic hard-stop command failure");
    },
  };

  await terminateAppServerChild(
    child as never,
    policy,
    { gracefulMs: 1, softMs: 1, hardMs: 10 },
  );
  assert.deepEqual(events, ["graceful", "soft", "hard-failed"]);
  assert.equal(policy.hasChildExited(child), true);
});
