import { spawn } from "node:child_process";

export const COMMUNICATION_NOTE_PREVIEW_HOSTED_CHILD_CONFIG_FD = 3;
export const COMMUNICATION_NOTE_PREVIEW_HOSTED_CHILD_STATUS_FD = 4;

const ALLOWED_BASE_ENVIRONMENT_KEYS = new Set([
  "PATH",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "CI",
  "NO_COLOR",
]);
const ENVIRONMENT_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const SYNCHRONOUS_PIPE_FAILURE_LATE_ERROR_RETENTION_MS = 1_000;
const ABSORB_TERMINAL_CHANNEL_ERROR = () => undefined;

export class CommunicationNotePreviewHostedChildChannelError extends Error {
  constructor(code, childStatus = undefined) {
    super(code);
    this.name = "CommunicationNotePreviewHostedChildChannelError";
    this.code = code;
    this.childStatus = childStatus;
  }
}

function fail(code, childStatus = undefined) {
  throw new CommunicationNotePreviewHostedChildChannelError(
    code,
    childStatus,
  );
}

export function createCommunicationNotePreviewHostedChildEnvironment({
  baseEnvironment,
  enableEnvironmentKey,
  inputPipeBindings,
  statusPipeBinding,
}) {
  const inputs = normalizePipeBindings(inputPipeBindings);
  const status = normalizeStatusPipeBinding(statusPipeBinding);
  if (
    !baseEnvironment ||
    typeof baseEnvironment !== "object" ||
    !validEnvironmentKey(enableEnvironmentKey) ||
    inputs.length === 0 ||
    !status ||
    new Set([
      enableEnvironmentKey,
      ...inputs.map((binding) => binding.environmentKey),
      status.environmentKey,
    ]).size !== inputs.length + 2 ||
    new Set([
      ...inputs.map((binding) => binding.fd),
      status.fd,
    ]).size !== inputs.length + 1
  ) {
    fail("HOSTED_CHILD_CHANNEL_ARGUMENT_INVALID");
  }
  const environment = Object.create(null);
  for (const [key, value] of Object.entries(baseEnvironment)) {
    if (
      typeof value === "string" &&
      ALLOWED_BASE_ENVIRONMENT_KEYS.has(key)
    ) {
      environment[key] = value;
    }
  }
  environment[enableEnvironmentKey] = "1";
  for (const binding of inputs) {
    environment[binding.environmentKey] = String(binding.fd);
  }
  environment[status.environmentKey] = String(status.fd);
  return Object.freeze(environment);
}

export function parseCommunicationNotePreviewHostedChildStatus({
  value,
  successStatus,
  failureStatuses,
  fallbackStatus,
  maximumBytes,
}) {
  const statuses = normalizeFailureStatuses(failureStatuses);
  if (
    !validStatus(successStatus) ||
    !validStatus(fallbackStatus) ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes <= 0 ||
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") > maximumBytes ||
    !value.endsWith("\n")
  ) {
    return fallbackStatus;
  }
  const code = value.slice(0, -1);
  if (code === successStatus) return code;
  return statuses.has(code) ? code : fallbackStatus;
}

export async function runCommunicationNotePreviewHostedChild({
  executable,
  args,
  cwd,
  environment,
  inputPipes,
  statusFd,
  successStatus,
  failureStatuses,
  fallbackStatus,
  pipeFailureStatus,
  timeoutMs,
  killGraceMs,
  maximumStatusBytes,
}) {
  const statuses = normalizeFailureStatuses(failureStatuses);
  let inputs = normalizeInputPipes(inputPipes);
  if (
    typeof executable !== "string" ||
    executable.length === 0 ||
    !Array.isArray(args) ||
    args.some((value) => typeof value !== "string") ||
    typeof cwd !== "string" ||
    cwd.length === 0 ||
    !environment ||
    typeof environment !== "object" ||
    inputs.length === 0 ||
    !validPipeFd(statusFd) ||
    new Set([...inputs.map((input) => input.fd), statusFd]).size !==
      inputs.length + 1 ||
    !validStatus(successStatus) ||
    !validStatus(fallbackStatus) ||
    !validStatus(pipeFailureStatus) ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    !Number.isSafeInteger(killGraceMs) ||
    killGraceMs < 0 ||
    !Number.isSafeInteger(maximumStatusBytes) ||
    maximumStatusBytes <= 0
  ) {
    fail("HOSTED_CHILD_CHANNEL_ARGUMENT_INVALID");
  }

  const maximumFd = Math.max(statusFd, ...inputs.map((input) => input.fd));
  const stdio = new Array(maximumFd + 1).fill("ignore");
  for (const input of inputs) stdio[input.fd] = "pipe";
  stdio[statusFd] = "pipe";

  let child;
  try {
    child = spawn(executable, args, {
      cwd,
      env: environment,
      shell: false,
      stdio,
    });
  } catch {
    fail("HOSTED_CHILD_CHANNEL_FAILED", fallbackStatus);
  }
  const inputStreams = inputs.map((input) => child.stdio[input.fd]);
  const statusPipe = child.stdio[statusFd];
  if (
    inputStreams.some(
      (stream) => !stream || typeof stream.end !== "function",
    ) ||
    !statusPipe ||
    typeof statusPipe.on !== "function"
  ) {
    child.kill("SIGTERM");
    fail("HOSTED_CHILD_CHANNEL_PIPE_FAILED", pipeFailureStatus);
  }

  let pipeFailed = false;
  let statusBytes = 0;
  let statusOverflow = false;
  const statusChunks = [];
  const markPipeFailed = () => {
    pipeFailed = true;
  };
  for (const stream of inputStreams) {
    stream.on("error", markPipeFailed);
  }
  statusPipe.on("error", markPipeFailed);
  const collectStatus = (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    statusBytes += buffer.length;
    if (statusBytes > maximumStatusBytes) {
      statusOverflow = true;
      statusChunks.length = 0;
      return;
    }
    if (!statusOverflow) statusChunks.push(buffer);
  };
  statusPipe.on("data", collectStatus);

  let exitErrorListener;
  let exitCloseListener;
  const exit = new Promise((resolve, reject) => {
    exitErrorListener = reject;
    exitCloseListener = (code, signal) => resolve({ code, signal });
    child.once("error", exitErrorListener);
    child.once("close", exitCloseListener);
  });
  let timedOut = false;
  let killTimer;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    killTimer = setTimeout(() => child.kill("SIGKILL"), killGraceMs);
  }, timeoutMs);

  const clearChildTimers = () => {
    clearTimeout(timeout);
    if (killTimer) clearTimeout(killTimer);
  };
  let lateErrorCleanupCloseListener;
  let lateErrorCleanupTimer;
  let resolveLateErrorCleanup;
  const detachChildChannelListeners = ({
    retainTerminalErrorSink = false,
  } = {}) => {
    if (lateErrorCleanupTimer) {
      clearTimeout(lateErrorCleanupTimer);
      lateErrorCleanupTimer = undefined;
    }
    for (const stream of inputStreams) {
      stream.removeListener?.("error", markPipeFailed);
      if (!retainTerminalErrorSink) {
        stream.removeListener?.("error", ABSORB_TERMINAL_CHANNEL_ERROR);
      }
    }
    statusPipe.removeListener?.("error", markPipeFailed);
    if (!retainTerminalErrorSink) {
      statusPipe.removeListener?.("error", ABSORB_TERMINAL_CHANNEL_ERROR);
    }
    statusPipe.removeListener?.("data", collectStatus);
    if (exitErrorListener) child.removeListener?.("error", exitErrorListener);
    if (exitCloseListener) child.removeListener?.("close", exitCloseListener);
    if (!retainTerminalErrorSink) {
      child.removeListener?.("error", ABSORB_TERMINAL_CHANNEL_ERROR);
      if (lateErrorCleanupCloseListener) {
        child.removeListener?.("close", lateErrorCleanupCloseListener);
        lateErrorCleanupCloseListener = undefined;
      }
    }
    if (resolveLateErrorCleanup) {
      const resolve = resolveLateErrorCleanup;
      resolveLateErrorCleanup = undefined;
      resolve();
    }
  };
  const retainBoundedLateErrorSinks = () => {
    for (const stream of inputStreams) {
      stream.removeListener?.("error", markPipeFailed);
      stream.on("error", ABSORB_TERMINAL_CHANNEL_ERROR);
    }
    statusPipe.removeListener?.("error", markPipeFailed);
    statusPipe.on("error", ABSORB_TERMINAL_CHANNEL_ERROR);
    statusPipe.removeListener?.("data", collectStatus);
    child.on("error", ABSORB_TERMINAL_CHANNEL_ERROR);
    const cleanup = new Promise((resolve) => {
      resolveLateErrorCleanup = resolve;
    });
    lateErrorCleanupCloseListener = () => {
      queueMicrotask(detachChildChannelListeners);
    };
    child.once("close", lateErrorCleanupCloseListener);
    lateErrorCleanupTimer = setTimeout(
      () => {
        requestChildHardKill();
        destroyChildChannelStreams();
        try {
          child.unref?.();
        } catch {
          // The bounded listener cleanup and fixed failure still follow.
        }
        detachChildChannelListeners({ retainTerminalErrorSink: true });
      },
      SYNCHRONOUS_PIPE_FAILURE_LATE_ERROR_RETENTION_MS,
    );
    return cleanup;
  };
  const requestChildHardKill = () => {
    try {
      return child.kill("SIGKILL") === true;
    } catch {
      return false;
    }
  };
  const destroyChildChannelStreams = () => {
    for (const stream of [...inputStreams, statusPipe]) {
      try {
        stream.destroy?.();
      } catch {
        // The fixed pipe failure remains authoritative.
      }
    }
  };
  const clearInputPayloadReferences = () => {
    for (const input of inputs) input.payload = undefined;
    inputs = [];
  };
  const abandonChildAfterSynchronousPipeFailure = async () => {
    clearChildTimers();
    clearInputPayloadReferences();
    void exit.catch(() => undefined);
    const cleanup = retainBoundedLateErrorSinks();
    requestChildHardKill();
    destroyChildChannelStreams();
    await cleanup;
  };

  try {
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      const payload = input.payload;
      input.payload = undefined;
      inputStreams[index].end(payload);
    }
  } catch {
    await abandonChildAfterSynchronousPipeFailure();
    fail("HOSTED_CHILD_CHANNEL_PIPE_FAILED", pipeFailureStatus);
  }
  inputs = [];

  let result;
  try {
    result = await exit;
  } catch {
    clearChildTimers();
    child.kill("SIGKILL");
    fail("HOSTED_CHILD_CHANNEL_FAILED", fallbackStatus);
  }
  clearChildTimers();
  if (pipeFailed) {
    fail("HOSTED_CHILD_CHANNEL_PIPE_FAILED", pipeFailureStatus);
  }
  const childStatus = statusOverflow
    ? fallbackStatus
    : parseCommunicationNotePreviewHostedChildStatus({
        value: Buffer.concat(statusChunks, statusBytes).toString("utf8"),
        successStatus,
        failureStatuses: statuses,
        fallbackStatus,
        maximumBytes: maximumStatusBytes,
      });
  if (timedOut || result.signal !== null) {
    fail("HOSTED_CHILD_CHANNEL_FAILED", fallbackStatus);
  }
  if (result.code !== 0) {
    fail(
      "HOSTED_CHILD_CHANNEL_FAILED",
      childStatus === successStatus ? fallbackStatus : childStatus,
    );
  }
  if (childStatus !== successStatus) {
    fail("HOSTED_CHILD_CHANNEL_FAILED", fallbackStatus);
  }
  return successStatus;
}

function normalizeFailureStatuses(value) {
  if (
    !(value instanceof Set) &&
    (!Array.isArray(value) || value.some((status) => !validStatus(status)))
  ) {
    return new Set();
  }
  const statuses = new Set(value);
  return [...statuses].every(validStatus) ? statuses : new Set();
}

function normalizePipeBindings(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) {
    return [];
  }
  const normalized = [];
  for (const candidate of value) {
    const object = exactDataRecord(candidate, ["environmentKey", "fd"]);
    if (
      !object ||
      !validEnvironmentKey(object.environmentKey) ||
      !validPipeFd(object.fd)
    ) {
      return [];
    }
    normalized.push(Object.freeze({
      environmentKey: object.environmentKey,
      fd: object.fd,
    }));
  }
  return normalized;
}

function normalizeStatusPipeBinding(value) {
  const object = exactDataRecord(value, ["environmentKey", "fd"]);
  if (
    !object ||
    !validEnvironmentKey(object.environmentKey) ||
    !validPipeFd(object.fd)
  ) {
    return undefined;
  }
  return Object.freeze({
    environmentKey: object.environmentKey,
    fd: object.fd,
  });
}

function normalizeInputPipes(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) {
    return [];
  }
  const normalized = [];
  for (const candidate of value) {
    const object = exactDataRecord(candidate, [
      "fd",
      "payload",
      "maximumBytes",
    ]);
    if (
      !object ||
      !validPipeFd(object.fd) ||
      !Number.isSafeInteger(object.maximumBytes) ||
      object.maximumBytes <= 0
    ) {
      return [];
    }
    const payload = normalizePayload(object.payload);
    if (
      !payload ||
      payload.byteLength === 0 ||
      payload.byteLength > object.maximumBytes
    ) {
      return [];
    }
    normalized.push({
      fd: object.fd,
      payload,
      maximumBytes: object.maximumBytes,
    });
  }
  return normalized;
}

function normalizePayload(value) {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return undefined;
}

function exactDataRecord(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.keys(descriptors).sort().join("\n") !==
      [...expectedKeys].sort().join("\n") ||
    Object.values(descriptors).some(
      (descriptor) => !("value" in descriptor) || !descriptor.enumerable,
    )
  ) {
    return undefined;
  }
  return Object.fromEntries(
    expectedKeys.map((key) => [key, descriptors[key].value]),
  );
}

function validEnvironmentKey(value) {
  return typeof value === "string" && ENVIRONMENT_KEY_PATTERN.test(value);
}

function validPipeFd(value) {
  return Number.isSafeInteger(value) && value >= 3 && value <= 16;
}

function validStatus(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\r\n\u0000]/.test(value)
  );
}
