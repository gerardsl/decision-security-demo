if (process.env.VERCEL_ENV === "production" && process.env.DEMO_FAULT_INJECTION === "1") {
  console.error("Refusing to build: DEMO_FAULT_INJECTION=1 while VERCEL_ENV=production.");
  process.exit(1);
}
