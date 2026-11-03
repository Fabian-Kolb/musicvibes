// Tiny test runner shared by the test scripts. check() prints "ok" or "FAIL" per test
// and works for plain and async test functions (await it for async ones); finish()
// prints the summary and exits with code 1 if anything failed.
let failed = 0;

export function check(name, fn) {
  const pass = () => console.log(`ok   ${name}`);
  const fail = (err) => {
    failed += 1;
    console.log(`FAIL ${name}\n     ${err?.code === 'ERR_ASSERTION' ? err.message : err?.stack ?? err}`);
  };
  try {
    const result = fn();
    if (result && typeof result.then === 'function') return result.then(pass, fail);
    pass();
  } catch (err) {
    fail(err);
  }
  return undefined;
}

export function finish(label) {
  if (failed) {
    console.log(`\n${failed} test(s) failed`);
    process.exit(1);
  }
  console.log(`\nall ${label} tests passed`);
}
