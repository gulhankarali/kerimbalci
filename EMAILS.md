# E-posta Taslakları — Book Reward

> **Durum:** TASLAK. Metinler gözden geçirilip onaylanacak. `{{...}}` alanları sistem doldurur.
> Üye tier bilgisi (`Bronz` / `Silver` / `Gold`) DB'de mevcut; e-postalar tier'a göre seçilir.
> **Bronz üyeler kitap almaz** — kitap e-postaları (1, 2, 3, 4) Bronz'a gitmez; Bronz için 5) kupon e-postası kullanılır.

Değişken alanlar:
- `{{name}}` — üye adı
- `{{months}}` — tamamlanan ödeme ayı
- `{{remaining}}` — kitaba kalan ay
- `{{tier}}` — Bronz / Silver / Gold
- `{{coupon_code}}` — Bronz %50 kitap indirim kuponu (üretim yöntemi netleşince)
- `{{year}}` — kaçıncı yıl ödülü (1, 2, …)
- `{{book}}` / `{{book1}}` / `{{book2}}` — kitap adları
- `{{selection_link}}` — Silver seçim bağlantısı (akış netleşince)

---

## 1) SILVER — Yıllık kitap seçim e-postası (müşteriye)

**Tetikleyici:** Silver üye 12 aylık ödemeyi (her yıl) tamamlar.
**Kime:** üyeye
**Konu:** 🎉 1 yılı tamamladınız — kitabınızı seçin

```
Merhaba {{name}},

kerimbalci.com'a {{months}} aydır kesintisiz destek olduğunuz için
çok teşekkür ederiz. {{year}}. yılınızı tamamladınız ve bu yılın
hediye kitabını seçme hakkı kazandınız. 🎁

Silver üyemiz olarak aşağıdaki iki kitaptan birini seçebilirsiniz:

  📕 ZAMANSIZ YAZILAR
  📗 VADEDİLMİŞ YAZILAR

Seçiminizi yapmak için: {{selection_link}}
(Dilerseniz bu e-postayı yanıtlayarak da tercihinizi bildirebilirsiniz.)

Okumaya devam ettiğiniz için teşekkürler,
Kerim Balcı
```

---

## 2) GOLD — Kitap ödülü e-postası (müşteriye)

**Tetikleyici:** Gold üye 12 aylık ödemeyi tamamlar.
**Kime:** üyeye
**Konu:** 🎉 1 yılı tamamladınız — iki kitabınız da yolda

```
Merhaba {{name}},

kerimbalci.com'a {{months}} aydır kesintisiz destek olduğunuz için
çok teşekkür ederiz. Gold üyemiz olarak {{year}}. yıl hediyeniz olan
iki kitabı da gönderiyoruz: 🎁

  📕 ZAMANSIZ YAZILAR
  📗 VADEDİLMİŞ YAZILAR

Kitaplarınız kısa süre içinde kargoya verilecektir.

Okumaya devam ettiğiniz için teşekkürler,
Kerim Balcı
```

---

## 3) ADMIN uyarısı — "kitap gönder" (gulhan.karali@gmail.com)

**Tetikleyici:** Silver veya Gold üye 12 ayı doldurur (günlük kontrol, GMT). Bronz hariç.
**Kime:** yöneticiye (sana)
**Konu:** 📚 Kitap gönderilecek: {{name}} ({{tier}})

```
Kitap gönderme zamanı geldi:

  Üye:   {{name}} <{{email}}>
  Tier:  {{tier}}
  Süre:  {{months}} ay ödeme (tamamlanan yıl: {{year}})

Gönderilecek:
  - Silver ise: ÜYENİN SEÇTİĞİ 1 kitap -> {{book}}
  - Gold ise:   ZAMANSIZ YAZILAR + VADEDİLMİŞ YAZILAR (2 kitap)

Bu uyarı üye başına bir kez gönderilir.
```

---

## 4) MÜŞTERİ — "neredeyse tamam" hatırlatma (pause durumunda)

**Tetikleyici:** Silver/Gold üye iptal/iade/ödeme-başarısız nedeniyle duraklar (bir kez). Bronz hariç.
**Kime:** üyeye
**Konu:** Kitabınıza çok az kaldı — {{remaining}} ay

```
Merhaba {{name}},

şu ana kadar {{months}} ayı tamamladınız. Hediye kitabınıza yalnızca
{{remaining}} ay kaldı! 📖

Üyeliğiniz şu an duraklamış görünüyor. Kaldığınız yerden devam
ederseniz biriktirdiğiniz süre korunur — sıfırdan başlamazsınız.

Tekrar aramızda görmek dileğiyle,
Kerim Balcı
```

---

## 5) BRONZ — %50 indirim kuponu e-postası (müşteriye)

**Tetikleyici:** Bronz üye 12 aylık ödemeyi tamamlar (dashboard'da "Earned the 50% coupon" listesi).
**Kime:** üyeye
**Konu:** 🎟️ Bir yıldır bizimlesiniz — kitabınızda %50 indirim

```
Merhaba {{name}},

{{months}} aydır kerimbalci.com'u desteklediğiniz için çok teşekkür ederiz.
Bronz üyemiz olarak dilediğiniz bir kitapta kullanabileceğiniz
%50 indirim kuponunuz hazır:

  Kupon kodu: {{coupon_code}}

Desteğiniz için yeniden teşekkürler,
Kerim Balcı
```

> **Şimdilik gönderilmiyor.** Kupon kodunun nasıl üretileceği (tek kod mu, üyeye özel mi,
> geçerlilik süresi) netleşene kadar bu e-posta taslak kalır.

---

## Açık sorular (metinleri etkiler)

1. **3. yıl ve sonrası** — sadece 2 kitap var; Silver 2 yılda ikisini alınca biter mi,
   yoksa ileride yeni kitaplar mı eklenecek? (sistem her iki duruma da hazırlanabilir)
2. **Gold tekrar** — Gold 12. ayda ikisini alıp bitiriyor mu, yoksa her yıl mı?
3. **Silver seçimi nasıl?** — seçim bağlantısı (dashboard/web) mi, yoksa e-postayı
   yanıtlayarak mı? `{{selection_link}}` buna göre netleşecek.
4. **Gönderen adı/imza** — "Kerim Balcı" uygun mu, yoksa farklı imza mı?
5. **Bronz kuponu** — tek ortak kod mu, üyeye özel kod mu? Geçerlilik süresi? Her yıl mı, bir kez mi?
```
