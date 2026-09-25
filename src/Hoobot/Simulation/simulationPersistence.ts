import { flushSimTradeSnapshots } from "./simTradeSnapshot";

let installed = false;

/** Flush pending simulation snapshots when the process is stopped (Ctrl+C / SIGTERM). */
export const installSimulationShutdownHandlers = (): void => {
  if (installed) return;
  installed = true;
  const flushAndExit = (signal: NodeJS.Signals): void => {
    flushSimTradeSnapshots();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.once("SIGINT", flushAndExit);
  process.once("SIGTERM", flushAndExit);
  process.once("beforeExit", flushSimTradeSnapshots);
};
