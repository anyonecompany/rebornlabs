/**
 * 차량 이미지 처리 유틸리티.
 * canvas API로 리사이즈 + WebP 변환, Supabase Storage 업로드.
 */

const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;
const WEBP_QUALITY = 0.85;

/**
 * 이미지 File을 1920px 이내로 리사이즈하고 WebP Blob으로 변환합니다.
 */
export async function processImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // 비율 유지 리사이즈
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

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("이미지 변환에 실패했습니다."));
            return;
          }
          resolve(blob);
        },
        "image/webp",
        WEBP_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지를 로드할 수 없습니다."));
    };

    img.src = objectUrl;
  });
}

/**
 * 처리된 Blob을 Supabase Storage vehicles 버킷에 업로드하고 공개 URL을 반환합니다.
 * RLS 정책에 따라 브라우저 클라이언트로 직접 업로드합니다.
 */
export async function uploadVehicleImage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  blob: Blob,
  vehicleId?: string,
): Promise<string> {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const folder = vehicleId ?? "temp";
  const path = `${folder}/${timestamp}_${random}.webp`;

  const { error } = await supabase.storage
    .from("vehicles")
    .upload(path, blob, {
      contentType: "image/webp",
      upsert: false,
    });

  if (error) {
    throw new Error(`이미지 업로드 실패: ${error.message}`);
  }

  const { data: signedData } = await supabase.storage
    .from("vehicles")
    .createSignedUrl(path, 3600);

  return signedData?.signedUrl ?? "";
}
