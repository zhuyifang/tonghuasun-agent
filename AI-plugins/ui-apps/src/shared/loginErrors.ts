/** 当前扫码登录流程已结束，或已被另一张新二维码替换。 */
export class QrLoginFlowExpiredError extends Error {
  constructor() {
    super("二维码已失效，请刷新二维码。");
    this.name = "QrLoginFlowExpiredError";
  }
}

export function isQrLoginFlowExpiredError(error: unknown): error is QrLoginFlowExpiredError {
  return error instanceof QrLoginFlowExpiredError;
}

/** 人工拖动的拼图位置没有通过上游验证；当前验证图不再继续复用。 */
export class SmsCaptchaRejectedError extends Error {
  constructor() {
    super("滑块位置没有对准");
    this.name = "SmsCaptchaRejectedError";
  }
}

export function isSmsCaptchaRejectedError(error: unknown): error is SmsCaptchaRejectedError {
  return error instanceof SmsCaptchaRejectedError;
}
