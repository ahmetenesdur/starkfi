# StarkFi — Manuel Test Rehberi

Gasless Mode (AVNU Paymaster) entegrasyonu sonrası tüm transaction türlerini test etmek için rehber.

> **Ön koşul:** `pnpm dev status` ile oturumun aktif olduğunu doğrula.

---

## 1. Config & Fee Mode

```bash
# Mevcut ayarları görüntüle
pnpm dev config list

# Gas token'ı kontrol et (default: STRK)
# feeMode: "gasless (pays STRK via AVNU Paymaster)" olmalı
```

### Gas Token Değişikliği

```bash
# USDC'ye geç
pnpm dev config set-gas-token USDC

# Kontrol et
pnpm dev config list
# feeMode: "gasless (pays USDC via AVNU Paymaster)" olmalı

# STRK'a geri dön
pnpm dev config set-gas-token reset
```

### Gasfree Mode (Developer Pays)

```bash
# Gasfree aç
pnpm dev config set-gasfree on
pnpm dev config list
# feeMode: "gasfree (developer-sponsored via AVNU)" olmalı

# Gasfree kapat (gasless'e döner)
pnpm dev config set-gasfree off
```

---

## 2. Wallet İşlemleri

```bash
# Bakiye
pnpm dev balance

# Adres
pnpm dev address

# Deploy (zaten deploy edilmişse "already deployed" der)
pnpm dev deploy
```

---

## 3. Token Transfer (Send)

```bash
# Küçük miktar STRK gönder (kendi adresine de gönderebilirsin)
pnpm dev send 0.001 STRK <ALICI_ADRESI>

# ✅ Beklenen: "Transfer confirmed" + txHash + explorer linki
# ❌ Başarısız olursa: hata mesajını kontrol et
```

---

## 4. Swap (Fibrous)

```bash
# STRK → ETH swap
pnpm dev trade 1 STRK ETH

# Slippage ile
pnpm dev trade 1 STRK ETH --slippage 1

# ✅ Beklenen: Route bilgisi + "Swap confirmed"
```

---

## 5. Staking

```bash
# Validator listesi
pnpm dev validators

# Validator pool'larını gör (multi-token)
pnpm dev pools <VALIDATOR_ADI>

# Stake (default: STRK)
pnpm dev stake 1 --validator <VALIDATOR_ADI>

# Multi-token stake
pnpm dev stake 0.001 --validator <VALIDATOR_ADI> --token WBTC

# Pozisyon bilgisi
pnpm dev rewards --validator <VALIDATOR_ADI>

# Reward claim
pnpm dev rewards --validator <VALIDATOR_ADI> --claim

# Compound (claim + restake)
pnpm dev rewards --validator <VALIDATOR_ADI> --compound

# Unstake intent (21 gün bekleme süresi başlar)
pnpm dev unstake intent --validator <VALIDATOR_ADI> --amount 0.5

# Unstake exit (bekleme süresi dolduktan sonra)
pnpm dev unstake exit --validator <VALIDATOR_ADI>

# Pool adresi ile de kullanılabilir
pnpm dev rewards --pool <POOL_ADRESI>
```

---

## 6. Lending (Vesu V2)

```bash
# Pool listesi
pnpm dev lend-pools

# Supply
pnpm dev lend-supply 1 -p Genesis -t STRK

# Pozisyon kontrol
pnpm dev lend-status -p Genesis --collateral-token STRK --debt-token USDC

# Withdraw
pnpm dev lend-withdraw 0.5 -p Genesis -t STRK

# Borrow (collateral gerekli)
pnpm dev lend-borrow -p Genesis \
  --collateral-amount 2 --collateral-token STRK \
  --borrow-amount 0.5 --borrow-token USDC

# Repay
pnpm dev lend-repay 0.5 -p Genesis -t USDC --collateral-token STRK
```

---

## 7. Farklı Gas Token'larla Test

Her bir transaction türünü farklı gas token'larla test et:

```bash
# 1. STRK (default)
pnpm dev config set-gas-token reset
pnpm dev send 0.001 STRK <ADRES>

# 2. ETH
pnpm dev config set-gas-token ETH
pnpm dev send 0.001 STRK <ADRES>

# 3. USDC
pnpm dev config set-gas-token USDC
pnpm dev send 0.001 STRK <ADRES>

# 4. STRK'a geri dön
pnpm dev config set-gas-token reset
```

---

## 8. Transaction Durumu

```bash
# Herhangi bir tx hash'i ile
pnpm dev tx-status <TX_HASH>
```

---

## Test Checklist

| #   | Test                       | Gas Token | Sonuç                                         |
| --- | -------------------------- | --------- | --------------------------------------------- |
| --- | -------------------------- | --------- | ---                                           |
| 1   | Config list                | -         | ✅                                            |
| 2   | Config set-gas-token USDC  | -         | ✅                                            |
| 3   | Config set-gas-token reset | -         | ✅                                            |
| 4   | Config set-gasfree on/off  | -         | ✅                                            |
| 5   | Balance                    | -         | ✅                                            |
| 6   | Send STRK                  | STRK      | ✅                                            |
| 7   | Send STRK                  | ETH       | ✅                                            |
| 8   | Send STRK                  | USDC      | ✅ (Voyager: Gas Fee Paymaster 0.0039 USDC)   |
| 9   | Swap STRK→USDC             | STRK      | ⏳ (bakiye yetersiz — paymaster fee ~10 STRK) |
| 10  | Stake                      | STRK      | ☐                                             |
| 11  | Rewards (view)             | -         | ☐                                             |
| 12  | Rewards --claim            | STRK      | ☐                                             |
| 13  | Rewards --compound         | STRK      | ☐                                             |
| 14  | Unstake intent             | STRK      | ☐                                             |
| 15  | Lend supply                | STRK      | ☐                                             |
| 16  | Lend withdraw              | STRK      | ☐                                             |
| 17  | Lend borrow                | STRK      | ☐                                             |
| 18  | Lend repay                 | STRK      | ☐                                             |
| 19  | Lend status                | -         | ☐                                             |
| 20  | Tx status                  | -         | ☐                                             |
