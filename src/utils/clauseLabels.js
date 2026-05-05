// NLP / GraphRAG snake_case alanlarini kullaniciya gosterilebilir Turkce label'a cevirir.
// Web tarafindaki frontend-web/src/utils/clauseLabels.js ile aynidir; ayni
// haritayi mobilde de kullanmak icin kopyalandi.

const CLAUSE_LABELS = {
  // Kira sözleşmesi
  kira_bedeli: 'Kira Bedeli',
  kira_suresi: 'Kira Süresi',
  baslangic_tarihi: 'Başlangıç Tarihi',
  bitis_tarihi: 'Bitiş Tarihi',
  depozito: 'Depozito',
  artis_orani: 'Yıllık Artış Oranı',
  odeme_gunu: 'Ödeme Günü',
  odeme_yontemi: 'Ödeme Yöntemi',
  odeme_plani: 'Ödeme Planı',
  tahliye_kosullari: 'Tahliye Koşulları',
  fesih_kosullari: 'Fesih Koşulları',
  taraf_kiraya_veren: 'Kiraya Veren',
  taraf_kiraci: 'Kiracı',
  kiralanan_yer: 'Kiralanan Mülk',
  kiralanan_adres: 'Kiralanan Adres',
  demirbas: 'Demirbaş Listesi',

  // Genel
  sure: 'Süre',
  tutar: 'Tutar',
  miktar: 'Miktar',
  para_birimi: 'Para Birimi',
  tarih: 'Tarih',
  taraf_alici: 'Alıcı',
  taraf_satici: 'Satıcı',
  taraf_borc_veren: 'Borç Veren',
  taraf_borc_alan: 'Borç Alan',
  taraf_isveren: 'İşveren',
  taraf_calisan: 'Çalışan',
  taraf_isci: 'İşçi',
  taraf_vekil: 'Vekil',
  taraf_muvekkil: 'Müvekkil',
  taraf_kefil: 'Kefil',
  taraf_alacakli: 'Alacaklı',
  taraf_borclu: 'Borçlu',
  yetkili_mahkeme: 'Yetkili Mahkeme',
  ceza_kosulu: 'Ceza Koşulu',
  kefalet: 'Kefalet',

  // Borç
  borc_tutari: 'Borç Tutarı',
  faiz_orani: 'Faiz Oranı',
  temerrut_faizi: 'Temerrüt Faizi',
  vade: 'Vade',
  geri_odeme_tarihi: 'Geri Ödeme Tarihi',
  geri_odeme_sekli: 'Geri Ödeme Şekli',

  // Satış
  satis_bedeli: 'Satış Bedeli',
  teslim_tarihi: 'Teslim Tarihi',
  teslim_yeri: 'Teslim Yeri',
  urun_aciklamasi: 'Ürün Açıklaması',

  // İş
  maas: 'Maaş',
  ucret: 'Ücret',
  pozisyon: 'Pozisyon',
  is_yeri: 'İş Yeri',
  calisma_saatleri: 'Çalışma Saatleri',
  deneme_suresi: 'Deneme Süresi',

  // Hizmet
  hizmet_konusu: 'Hizmet Konusu',
  hizmet_bedeli: 'Hizmet Bedeli',

  // Vekalet / Taahhüt / Kefalet / NDA
  vekalet_konusu: 'Vekalet Konusu',
  yetki_kapsami: 'Yetki Kapsamı',
  taahhut_konusu: 'Taahhüt Konusu',
  kefalet_tutari: 'Kefalet Tutarı',
  kefalet_suresi: 'Kefalet Süresi',
  gizlilik_konusu: 'Gizlilik Konusu',
  gizlilik_suresi: 'Gizlilik Süresi',
};

const PLACEHOLDERS = {
  kira_bedeli: 'Aylık kira tutarını yazın (örn. 20000 TL)',
  kira_suresi: 'Sözleşme süresi (örn. 12 ay)',
  baslangic_tarihi: 'GG.AA.YYYY',
  bitis_tarihi: 'GG.AA.YYYY',
  depozito: 'Depozito tutarı (örn. 40000 TL)',
  artis_orani: 'Yıllık artış oranı (örn. %25)',
  odeme_gunu: 'Ayın kaçı (örn. 5)',
  odeme_yontemi: 'Nakit / EFT / Havale / IBAN',
  odeme_plani: 'Aylık peşin / 3 taksit vb.',
  taraf_kiraya_veren: 'Kiraya verenin adı soyadı',
  taraf_kiraci: 'Kiracının adı soyadı',
  taraf_isveren: 'İşverenin adı/ünvanı',
  taraf_calisan: 'Çalışanın adı soyadı',
  taraf_isci: 'İşçinin adı soyadı',
  kiralanan_yer: 'Kiralanan mülkün açıklaması',
  kiralanan_adres: 'Açık adres',
  sure: 'Süre (örn. 12 ay)',
  tutar: 'Tutar (örn. 5000 TL)',
  borc_tutari: 'Borç tutarı (örn. 5000 TL)',
  faiz_orani: 'Faiz oranı (örn. %2 aylık)',
  temerrut_faizi: 'Temerrüt faizi (örn. %5)',
  vade: 'Vade (örn. 6 ay)',
  geri_odeme_tarihi: 'GG.AA.YYYY',
  satis_bedeli: 'Satış bedeli',
  teslim_tarihi: 'GG.AA.YYYY',
  maas: 'Aylık maaş (örn. 50000 TL)',
  ucret: 'Aylık brüt ücret (örn. 50000 TL)',
  pozisyon: 'Pozisyon / unvan',
  yetkili_mahkeme: 'Yetkili mahkeme (örn. İstanbul Mahkemeleri)',
  ceza_kosulu: 'Ceza koşulu tutarı / oranı',
  kefalet: 'Kefilin adı soyadı ve TC no',
};

const toTitleCase = (raw) => {
  if (!raw) return '';
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toLocaleUpperCase('tr-TR'));
};

export const labelForClause = (clause) => {
  if (!clause) return '';
  if (typeof clause === 'string') {
    return CLAUSE_LABELS[clause] || toTitleCase(clause);
  }
  // backend bazen { name, field_name, description } gönderiyor
  const candidate = clause.field_name || clause.id || clause.name;
  if (typeof candidate === 'string' && CLAUSE_LABELS[candidate]) {
    return CLAUSE_LABELS[candidate];
  }
  if (typeof clause.name === 'string' && CLAUSE_LABELS[clause.name]) {
    return CLAUSE_LABELS[clause.name];
  }
  return CLAUSE_LABELS[candidate] || toTitleCase(candidate || '');
};

export const placeholderForClause = (clause) => {
  if (!clause) return '';
  const id = typeof clause === 'string' ? clause : (clause.field_name || clause.id || clause.name);
  return PLACEHOLDERS[id] || '';
};

export default { labelForClause, placeholderForClause };
