# Reborn Labs ERD (Entity-Relationship Diagram)

## ER 다이어그램

```mermaid
erDiagram
    profiles {
        uuid id PK "auth.users FK"
        text email
        text name
        text phone
        text role
        boolean is_active
        boolean must_change_password
        timestamptz created_at
        timestamptz updated_at
    }

    vehicles {
        uuid id PK
        text vehicle_code UK
        text make
        text model
        int year
        int mileage
        numeric purchase_price
        numeric selling_price
        numeric deposit
        numeric monthly_payment
        numeric margin "GENERATED"
        text status
        text[] photos
        timestamptz deleted_at
        timestamptz created_at
        timestamptz updated_at
    }

    consultations {
        uuid id PK
        text customer_name
        text phone
        text interested_vehicle
        text message
        text source_ref
        uuid assigned_dealer_id FK
        text marketing_company
        text status
        boolean is_duplicate
        timestamptz created_at
        timestamptz updated_at
    }

    consultation_logs {
        uuid id PK
        uuid consultation_id FK
        uuid dealer_id FK
        text content
        text status_snapshot
        timestamptz created_at
    }

    sales {
        uuid id PK
        uuid consultation_id FK "nullable"
        uuid vehicle_id FK
        uuid dealer_id FK
        uuid actor_id FK
        boolean is_db_provided
        numeric dealer_fee
        numeric marketing_fee
        timestamptz cancelled_at
        timestamptz created_at
        timestamptz updated_at
    }

    delivery_checklists {
        uuid id PK
        uuid vehicle_id FK
        uuid dealer_id FK
        boolean contract_uploaded
        boolean deposit_confirmed
        boolean customer_briefed
        boolean delivery_photo_uploaded
        timestamptz completed_at
        timestamptz created_at
        "UNIQUE(vehicle_id, dealer_id)" _constraint
    }

    expenses {
        uuid id PK
        uuid user_id FK
        date expense_date
        numeric amount
        text purpose
        text[] receipt_urls
        timestamptz created_at
    }

    documents {
        uuid id PK
        uuid uploaded_by FK
        text category
        text file_name
        text file_url
        timestamptz created_at
    }

    audit_logs {
        uuid id PK
        uuid actor_id FK "nullable"
        text action
        text target_type
        uuid target_id
        jsonb metadata
        timestamptz created_at
    }

    rate_limits {
        uuid id PK
        text ip_address
        text endpoint
        timestamptz requested_at
    }

    %% Relationships

    profiles ||--o{ consultations : "assigned_dealer"
    profiles ||--o{ consultation_logs : "dealer"
    profiles ||--o{ sales : "dealer"
    profiles ||--o{ sales : "actor"
    profiles ||--o{ delivery_checklists : "dealer"
    profiles ||--o{ expenses : "user"
    profiles ||--o{ documents : "uploaded_by"
    profiles ||--o{ audit_logs : "actor"

    consultations ||--o{ consultation_logs : "consultation"
    consultations ||--o| sales : "consultation (nullable)"

    vehicles ||--o{ sales : "vehicle"
    vehicles ||--o{ delivery_checklists : "vehicle"
```

## 관계 요약 (한국어)

### 핵심 엔티티

| 테이블 | 역할 |
|--------|------|
| **profiles** | 시스템 사용자 (딜러, 관리자 등). `auth.users`와 1:1 연결 |
| **vehicles** | 재고 차량. 차량 코드(UNIQUE)로 식별. soft delete 지원 |
| **consultations** | 고객 상담 건. 랜딩페이지/GAS 등 외부 유입 포함 |

### 주요 관계

1. **profiles -> consultations**: 딜러가 상담 건을 배정받는다 (1:N)
2. **consultations -> consultation_logs**: 하나의 상담에 여러 로그가 기록된다 (1:N). 상태 변경 이력 추적
3. **consultations -> sales**: 상담이 판매로 전환된다 (1:0..1). 상담 없이 직접 판매도 가능 (nullable FK)
4. **vehicles -> sales**: 차량 1대가 판매 기록을 가진다 (1:N, 취소 후 재판매 가능)
5. **vehicles -> delivery_checklists**: 차량+딜러 조합으로 인도 체크리스트 생성 (UNIQUE 제약)
6. **profiles -> sales**: 딜러(dealer_id)와 등록자(actor_id) 이중 참조
7. **profiles -> expenses**: 사용자별 경비 기록 (1:N)
8. **profiles -> documents**: 사용자별 문서 업로드 (1:N)
9. **profiles -> audit_logs**: 모든 주요 행위의 감사 로그 (1:N, actor nullable = 시스템 자동 생성)
10. **rate_limits**: 독립 테이블. IP+엔드포인트 기반 요청 제한 (다른 테이블과 FK 없음)

### 비즈니스 흐름

```
고객 유입 (랜딩페이지/GAS)
  -> consultations (상담 생성)
    -> consultation_logs (상담 진행 기록)
      -> sales (판매 전환)
        -> delivery_checklists (인도 완료)
```

### 보조 테이블

- **expenses**: 딜러/직원 경비 정산
- **documents**: 계약서, 사진 등 파일 관리
- **audit_logs**: 전체 시스템 감사 추적
- **rate_limits**: API 요청 제한 (보안)
