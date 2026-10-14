if (process.env.VERCEL_ENV === "production" && process.env.DEMO_FAULT_INJECTION === "1") {
  console.error("Refusing to build: DEMO_FAULT_INJECTION=1 while VERCEL_ENV=production.");
  process.exit(1);
}

if (process.env.VERCEL_ENV === "production" && process.env.NEXT_PUBLIC_USE_MOCK === "1") {
  console.error("Refusing to build: NEXT_PUBLIC_USE_MOCK=1 while VERCEL_ENV=production.");
  process.exit(1);
}
