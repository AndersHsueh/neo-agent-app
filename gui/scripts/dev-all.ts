/** 一条命令起前端 + dummy：两个子进程，任一退出就都收掉。 */
export {};

const dummy = Bun.spawn(["bun", "run", "../dummy-serv/src/index.ts"], {
  stdout: "inherit",
  stderr: "inherit",
});
const vite = Bun.spawn(["bun", "x", "vite"], { stdout: "inherit", stderr: "inherit" });

const shutdown = (code = 0) => {
  dummy.kill();
  vite.kill();
  process.exit(code);
};
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
await Promise.race([dummy.exited, vite.exited]);
shutdown(1);
