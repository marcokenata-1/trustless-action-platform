import { consola, type ConsolaInstance } from "consola";

const verbose =
  process.env.VERBOSE === "1" ||
  process.argv.includes("--verbose") ||
  process.argv.includes("-v");

export const log: ConsolaInstance = consola.withTag("demo-e2e");

export function isVerbose(): boolean {
  return verbose;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
