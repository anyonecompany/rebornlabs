# GAS -> Supabase 연동 가이드

## 개요

기존 랜딩페이지 폼 -> GAS -> 이메일 + 스프레드시트 파이프라인에
Supabase INSERT를 추가한다. **프론트엔드 수정 없음.**

기존 흐름은 그대로 유지하고, GAS 코드에 Supabase 호출만 추가한다.
Supabase 호출이 실패해도 기존 이메일/스프레드시트 동작에 영향을 주지 않는다.

```
랜딩페이지 폼
  -> GAS doPost()
    -> sendEmail()           (기존 유지)
    -> saveToSpreadsheet()   (기존 유지)
    -> sendToSupabase()      (신규 추가)
```

## 1. Supabase 설정

### 필요 정보

- **Supabase Project URL**: `https://<project-ref>.supabase.co`
- **Service Role Key**: `eyJ...` (절대 클라이언트에 노출 금지)

> Service Role Key는 RLS(Row Level Security)를 우회한다.
> 서버 사이드(GAS)에서만 사용하고, 브라우저/앱 클라이언트에 절대 포함하지 않는다.

### 환경 변수 설정 (GAS)

GAS 프로젝트 -> 설정(톱니바퀴) -> **스크립트 속성**:

| 속성 이름 | 값 | 비고 |
|----------|-----|------|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | 프로젝트 URL |
| `SUPABASE_SERVICE_KEY` | `eyJ...` | Service Role Key |

## 2. 폼 필드 매핑

| 랜딩페이지 폼 | GAS payload 키 | Supabase consultations 컬럼 | 비고 |
|--------------|----------------|---------------------------|------|
| name | `name` | `customer_name` | 필수 |
| phone | `phone` | `phone` | 필수. 트리거가 자동 정규화 |
| vehicle (select) | `vehicle` | `interested_vehicle` | 70+ 차종 선택 |
| message (textarea) | `message` | `message` | 선택 |
| ref (utm) | `ref` | `source_ref` | 유입 경로 추적 |

## 3. RPC 함수 호출 방법

Supabase에 `insert_consultation_from_gas` RPC 함수가 생성되어 있다.
직접 테이블 INSERT 대신 RPC를 사용하는 이유:

- 중복 체크 로직 포함
- audit_log 자동 기록
- 전화번호 정규화 처리

### curl 예시

```bash
curl -X POST 'https://<project-ref>.supabase.co/rest/v1/rpc/insert_consultation_from_gas' \
  -H 'apikey: <SERVICE_ROLE_KEY>' \
  -H 'Authorization: Bearer <SERVICE_ROLE_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{
    "p_customer_name": "홍길동",
    "p_phone": "010-1234-5678",
    "p_interested_vehicle": "현대 그랜저",
    "p_message": "견적 문의드립니다",
    "p_source_ref": "naver_blog"
  }'
```

### GAS JavaScript 예시

```javascript
/**
 * Supabase consultations 테이블에 상담 데이터를 저장한다.
 * 실패해도 기존 로직에 영향을 주지 않는다.
 *
 * @param {Object} formData - 폼 데이터 {name, phone, vehicle, message, ref}
 * @returns {Object|null} Supabase 응답 또는 null (실패 시)
 */
function sendToSupabase(formData) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL');
  var key = props.getProperty('SUPABASE_SERVICE_KEY');

  if (!url || !key) {
    console.warn('Supabase 설정 없음 -- 건너뜀');
    return null;
  }

  var payload = {
    p_customer_name: formData.name || '',
    p_phone: formData.phone || '',
    p_interested_vehicle: formData.vehicle || null,
    p_message: formData.message || null,
    p_source_ref: formData.ref || 'direct'
  };

  try {
    var response = UrlFetchApp.fetch(
      url + '/rest/v1/rpc/insert_consultation_from_gas',
      {
        method: 'POST',
        contentType: 'application/json',
        headers: {
          'apikey': key,
          'Authorization': 'Bearer ' + key
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );

    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      console.log('Supabase 저장 성공:', response.getContentText());
      return JSON.parse(response.getContentText());
    } else {
      console.error('Supabase 저장 실패:', code, response.getContentText());
      return null;
    }
  } catch (e) {
    console.error('Supabase 연결 실패:', e.message);
    return null;
  }
}
```

## 4. 기존 GAS에 추가하는 방법

기존 `doPost` 함수에 `sendToSupabase` 호출을 추가한다.
**기존 코드는 한 줄도 수정하지 않는다.**

```javascript
function doPost(e) {
  var data = JSON.parse(e.postData.contents);

  // === 기존 로직 (그대로 유지) ===
  sendEmail(data);
  saveToSpreadsheet(data);

  // === Supabase 추가 (실패해도 기존 동작에 영향 없음) ===
  sendToSupabase(data);

  return ContentService.createTextOutput('OK');
}
```

### 변경 요약

| 항목 | 변경 내용 |
|------|----------|
| `doPost()` | `sendToSupabase(data)` 한 줄 추가 |
| 새 함수 | `sendToSupabase()` 함수 추가 |
| 스크립트 속성 | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` 2개 추가 |
| 기존 코드 | **변경 없음** |

## 5. 에러 핸들링

| 상황 | 동작 | 기존 로직 영향 |
|------|------|--------------|
| Supabase 정상 | 저장 성공, 로그 출력 | 없음 |
| 네트워크 타임아웃 | catch에서 처리, null 반환 | 없음 |
| 인증 실패 (401/403) | console.error 로깅 | 없음 |
| 데이터 검증 실패 (400) | console.error 로깅 | 없음 |
| 스크립트 속성 미설정 | console.warn 후 건너뜀 | 없음 |

> **핵심 원칙**: Supabase 호출은 부가 기능이다.
> 실패하더라도 이메일 발송과 스프레드시트 저장은 반드시 정상 동작해야 한다.

### 타임아웃

- `UrlFetchApp`의 기본 타임아웃: 30초
- 30초 초과 시 `catch` 블록에서 처리
- Supabase RPC는 일반적으로 100ms 이내 응답

## 6. 보안 주의사항

| 항목 | 규칙 |
|------|------|
| Service Role Key 저장 | GAS **스크립트 속성에만** 저장. 코드에 하드코딩 금지 |
| GAS 프로젝트 접근 | **운영진만** 접근 가능하도록 공유 설정 |
| 클라이언트 노출 | Service Role Key는 RLS를 우회하므로 **절대** 브라우저/앱에 노출 금지 |
| 키 로테이션 | Supabase 대시보드에서 주기적 갱신 권장 |
| 로깅 | GAS 로그에 키 값이 출력되지 않도록 주의 |

## 7. 테스트 방법

### Step 1: GAS 편집기에서 단위 테스트

```javascript
function testSendToSupabase() {
  var testData = {
    name: '테스트 고객',
    phone: '010-0000-0000',
    vehicle: '현대 그랜저 2024',
    message: '테스트 문의입니다',
    ref: 'test'
  };

  var result = sendToSupabase(testData);
  console.log('결과:', JSON.stringify(result));
}
```

GAS 편집기 상단에서 `testSendToSupabase` 선택 후 실행 버튼 클릭.

### Step 2: Supabase 대시보드 확인

1. Supabase 대시보드 -> Table Editor -> `consultations`
2. `customer_name = '테스트 고객'` 행이 생성되었는지 확인
3. `source_ref = 'test'`로 필터링

### Step 3: audit_logs 확인

1. Table Editor -> `audit_logs`
2. `action = 'gas_consultation_created'` 행 확인
3. `metadata`에 원본 데이터가 기록되어 있는지 확인

### Step 4: 중복 체크 테스트

같은 테스트 데이터로 2번 실행:
- 첫 번째: 정상 저장
- 두 번째: `is_duplicate = true`로 저장되거나, RPC 응답에 중복 표시

### Step 5: 테스트 데이터 정리

테스트 완료 후 Supabase 대시보드에서 테스트 행 삭제:
- `source_ref = 'test'` 필터 -> 해당 행 삭제

## 8. 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `Supabase 설정 없음` 경고 | 스크립트 속성 미설정 | GAS 설정 -> 스크립트 속성에 URL/KEY 추가 |
| 401 Unauthorized | Service Role Key 오류 | Supabase 대시보드에서 키 재확인 |
| 403 Forbidden | RLS 정책 충돌 | Service Role Key가 맞는지 확인 (anon key 사용 불가) |
| 400 Bad Request | 필수 필드 누락 또는 형식 오류 | `p_customer_name`, `p_phone` 필수 확인 |
| 네트워크 에러 | GAS -> Supabase 연결 불가 | Supabase 프로젝트 상태 확인, 일시적 장애일 수 있음 |
| RPC 함수 없음 (404) | 마이그레이션 미실행 | `insert_consultation_from_gas` 함수 생성 여부 확인 |
