export default async function sleep(ms) {
  if (ms > 0) return new Promise((res) => setTimeout(res, ms));
}
