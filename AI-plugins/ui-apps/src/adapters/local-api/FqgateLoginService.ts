import type {
  LoginResult,
  LoginService,
  QrLoginProgress,
  QrLoginSession,
  SmsLoginSession
} from "@/shared/contracts";
import { FqgateHttpClient, type FqgateHttpClientOptions } from "./FqgateHttpClient";

interface FqgateLoginResult {
  connected: boolean;
  login_method: "qr" | "sms";
}

interface FqgateQrSession {
  flow_id: number;
  qr_image_base64: string;
  qr_media_type: string;
  status: "waiting_for_scan" | "waiting_for_confirmation";
}

interface FqgateQrPending {
  flow_id: number;
  status: "waiting_for_scan" | "waiting_for_confirmation";
}

interface FqgateSmsSession {
  flow_id: number;
  captcha: {
    background_image_base64: string;
    background_media_type: string;
    slider_image_base64: string;
    slider_media_type: string;
    initial_x: number;
    initial_y: number;
    image_width: number;
    image_height: number;
  };
}

interface FqgateSendCodeResult {
  code_sent: boolean;
}

export type FqgateLoginServiceOptions = FqgateHttpClientOptions;

/**
 * 浏览器直连 FQGate 的登录适配器。业务组件只依赖 LoginService，后续厂商
 * 如果要求通过工具调用完成登录，只需提供另一份适配器，不需要修改组件。
 */
export class FqgateLoginService implements LoginService {
  readonly kind = "fqgate-local-api";

  private readonly client: FqgateHttpClient;

  constructor(options: FqgateLoginServiceOptions = {}) {
    this.client = new FqgateHttpClient(options);
  }

  get connection() {
    return this.client.connection;
  }

  async beginQrLogin(): Promise<QrLoginSession> {
    const result = await this.client.post<FqgateQrSession>("/v1/market/session/qr/begin", {
      cache_credentials: false
    });
    return {
      flowId: result.flow_id,
      imageBase64: result.qr_image_base64,
      mediaType: result.qr_media_type,
      status: result.status
    };
  }

  async pollQrLogin(flowId: number): Promise<QrLoginProgress> {
    const result = await this.client.post<FqgateQrPending | FqgateLoginResult>(
      "/v1/market/session/qr/poll",
      { flow_id: flowId }
    );
    if ("connected" in result) return toLoginResult(result);
    return { connected: false, flowId: result.flow_id, status: result.status };
  }

  async beginSmsLogin(phoneNumber: string): Promise<SmsLoginSession> {
    const result = await this.client.post<FqgateSmsSession>("/v1/market/session/sms/begin", {
      country_code: "86",
      phone_number: phoneNumber,
      cache_credentials: false
    });
    return {
      flowId: result.flow_id,
      captcha: {
        backgroundImageBase64: result.captcha.background_image_base64,
        backgroundMediaType: result.captcha.background_media_type,
        sliderImageBase64: result.captcha.slider_image_base64,
        sliderMediaType: result.captcha.slider_media_type,
        initialX: result.captcha.initial_x,
        initialY: result.captcha.initial_y,
        imageWidth: result.captcha.image_width,
        imageHeight: result.captcha.image_height
      }
    };
  }

  async sendSmsCode(flowId: number, relativeX: number, relativeY: number): Promise<void> {
    const result = await this.client.post<FqgateSendCodeResult>("/v1/market/session/sms/send-code", {
      flow_id: flowId,
      relative_x: relativeX,
      relative_y: relativeY
    });
    if (!result.code_sent) throw new Error("短信验证码发送失败，请重新完成滑块验证。");
  }

  async completeSmsLogin(flowId: number, verificationCode: string): Promise<LoginResult> {
    const result = await this.client.post<FqgateLoginResult>("/v1/market/session/sms/complete", {
      flow_id: flowId,
      verification_code: verificationCode
    });
    return toLoginResult(result);
  }
}

function toLoginResult(result: FqgateLoginResult): LoginResult {
  if (!result.connected) throw new Error("行情服务未连接。");
  return { connected: true, method: result.login_method };
}
