/**
 * 차량 이미지 처리 유틸리티.
 * canvas API로 리사이즈 + WebP 변환, API를 통해 서버 사이드 업로드.
 */

import { apiFetch } from "./api-client";

const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;
const WEBP_QUALITY = 0.85;

/**
 * 이미지 File을 1920px 이내로 리사이즈하고 WebP Blob으로 변환합니다.
 */
export async function processImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context를 생성할 수 없습니다."));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      try {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("이미지 변환에 실패했습니다. (canvas.toBlob: null 반환)"));
              return;
            }
            resolve(blob);
          },
          "image/webp",
          WEBP_QUALITY,
        );
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        reject(new Error(`이미지 변환에 실패했습니다. (canvas.toBlob: ${reason})`));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지를 로드할 수 없습니다."));
    };

    img.src = objectUrl;
  });
}

/**
 * 처리된 Blob을 API를 통해 서버 사이드로 업로드합니다.
 * service_role로 Storage에 직접 업로드하므로 RLS 차단 없음.
 */
export async function uploadVehicleImage(
  _supabase: unknown,
  blob: Blob,
  _vehicleId?: string,
): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob, "image.webp");

  const res = await apiFetch("/api/vehicles/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "이미지 업로드 실패");
  }

  const data = await res.json();
  return data.url ?? "";
}
