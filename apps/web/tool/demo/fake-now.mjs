// Preload (node --import): moves this process's clock to FAKE_NOW, so a recording shows a normal
// school morning whatever day it is made on. Recording only.
const target = Date.parse(process.env.FAKE_NOW ?? '');
if (!Number.isNaN(target)) {
  const offset = target - Date.now();
  const RealDate = Date;
  class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }
    static now() {
      return RealDate.now() + offset;
    }
  }
  globalThis.Date = ShiftedDate;
}
