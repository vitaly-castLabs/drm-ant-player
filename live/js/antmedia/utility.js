export function isAndroid() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera || "";
  return /android/i.test(userAgent);
}
