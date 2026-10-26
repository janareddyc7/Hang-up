// Keep unit-test module imports from accidentally connecting to a real database.
// Integration suites use TEST_DATABASE_URL only when it is explicitly exported.
if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = "postgres://hangup:hangup@127.0.0.1:5432/hangup";
}
if (!process.env.DATABASE_URL_UNPOOLED?.trim()) {
  process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
}
