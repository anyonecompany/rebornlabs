#!/bin/bash
# seed-admins.sh — 경영진 3명 초기 계정 생성
# 사용법: ./scripts/seed-admins.sh
# 비밀번호는 랜덤 생성 → 콘솔 출력만 (코드에 하드코딩 금지)

set -euo pipefail

# .env.local에서 키 로드
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ ! -f "$PROJECT_DIR/.env.local" ]; then
  echo "ERROR: .env.local 파일이 없습니다."
  exit 1
fi

SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL "$PROJECT_DIR/.env.local" | cut -d= -f2-)
SERVICE_ROLE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY "$PROJECT_DIR/.env.local" | cut -d= -f2-)

if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
  echo "ERROR: .env.local에서 Supabase URL 또는 Service Role Key를 찾을 수 없습니다."
  exit 1
fi

# 경영진 이메일 목록
ADMINS=(
  "sungjun3216@gmail.com:관리자1"
  "sjysjy0213@naver.com:관리자2"
  "qhdtndks37@naver.com:관리자3"
)

echo "============================================"
echo "  Reborn Labs — 경영진 계정 시딩"
echo "============================================"
echo ""

for admin in "${ADMINS[@]}"; do
  EMAIL="${admin%%:*}"
  NAME="${admin##*:}"

  # 랜덤 비밀번호 생성 (영문대소문자+숫자+특수문자 12자리)
  PASSWORD="Rb$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | head -c 10)"

  echo "▶ 생성 중: $EMAIL ($NAME)"

  # Supabase Auth Admin API로 사용자 생성
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "${SUPABASE_URL}/auth/v1/admin/users" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"${EMAIL}\",
      \"password\": \"${PASSWORD}\",
      \"email_confirm\": true,
      \"user_metadata\": {\"name\": \"${NAME}\"}
    }")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" != "200" ]; then
    echo "  ⚠️  HTTP $HTTP_CODE — $BODY"
    continue
  fi

  # UUID 추출
  USER_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

  if [ -z "$USER_ID" ]; then
    echo "  ⚠️  UUID 추출 실패"
    continue
  fi

  # profiles 테이블에 INSERT (service_role로 RLS bypass)
  PROFILE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "${SUPABASE_URL}/rest/v1/profiles" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{
      \"id\": \"${USER_ID}\",
      \"email\": \"${EMAIL}\",
      \"name\": \"${NAME}\",
      \"role\": \"admin\",
      \"is_active\": true,
      \"must_change_password\": true
    }")

  PROFILE_CODE=$(echo "$PROFILE_RESPONSE" | tail -1)

  if [ "$PROFILE_CODE" = "201" ]; then
    echo "  ✅ 성공 (UUID: ${USER_ID})"
  else
    PROFILE_BODY=$(echo "$PROFILE_RESPONSE" | sed '$d')
    echo "  ⚠️  프로필 INSERT HTTP $PROFILE_CODE — $PROFILE_BODY"
  fi

  echo "  📧 이메일: $EMAIL"
  echo "  🔑 임시 비밀번호: $PASSWORD"
  echo ""
done

echo "============================================"
echo "  ⚠️  위 비밀번호를 안전하게 전달하세요."
echo "  최초 로그인 시 변경이 강제됩니다."
echo "============================================"
