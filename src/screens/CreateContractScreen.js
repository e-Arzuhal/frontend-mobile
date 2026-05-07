import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { colors, fonts, radius, shadows } from '../styles/tokens';
import Header from '../components/Header';
import Card from '../components/Card';
import Input from '../components/Input';
import TextArea from '../components/TextArea';
import Button from '../components/Button';
import StepIndicator from '../components/StepIndicator';
import ScreenWrapper from '../components/ScreenWrapper';
import contractService from '../services/contract.service';
import { API_BASE_URL } from '../config/api.config';
import useVoiceInput from '../hooks/useVoiceInput';
import verificationService from '../services/verification.service';
import { labelForClause, placeholderForClause } from '../utils/clauseLabels';

const TOTAL_STEPS = 4;
const stepLabels = ['Metin Girişi', 'Sözleşme Önerisi', 'Önizleme & Karşı Taraf', 'Tamamlandı'];

const TYPE_LABELS = {
  SALES: 'Satış Sözleşmesi',
  RENTAL: 'Kira Sözleşmesi',
  SERVICE: 'Hizmet Sözleşmesi',
  EMPLOYMENT: 'İş Sözleşmesi',
  NDA: 'Gizlilik Sözleşmesi',
  OTHER: 'Diğer Sözleşme',
  kira_sozlesmesi: 'Kira Sözleşmesi',
  hizmet_sozlesmesi: 'Hizmet Sözleşmesi',
  satis_sozlesmesi: 'Satış Sözleşmesi',
  is_sozlesmesi: 'İş Sözleşmesi',
  borc_sozlesmesi: 'Borç Sözleşmesi',
  vekaletname: 'Vekaletname',
  taahhutname: 'Taahhütname',
};

const ENTITY_LABELS = {
  tutar: 'Tutar',
  tarih: 'Tarih',
  taraflar: 'Taraflar',
  alacakli: 'Alacaklı',
  borclu: 'Borçlu',
  miktar: 'Miktar',
  sure: 'Süre',
  adres: 'Adres',
};

export default function CreateContractScreen({ navigation }) {
  // Tab navigator alt tab'ı yüzünden form alttayken klavye TextArea'yı kapatıyordu;
  // KeyboardAvoidingView'a tab bar yüksekliğini offset olarak ver.
  const tabBarHeight = useBottomTabBarHeight();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedContractId, setSavedContractId] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    type: '',
    content: '',
    amount: '',
    counterpartyName: '',
    counterpartyRole: '',
    counterpartyTcKimlik: '',
  });
  const [tcLookupResult, setTcLookupResult] = useState(null);
  const [tcLooking, setTcLooking] = useState(false);
  const [errors, setErrors] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState({});
  // Seçilen önerilen maddelerin kullanıcı tarafından girilen değerleri.
  // Önceden öneri metnindeki soru cümlesi (örn. "Aylık kira tutarı?") direkt
  // PDF'e ekleniyordu — bu artık `field_name: value` olarak yazılıyor.
  const [suggestionValues, setSuggestionValues] = useState({});

  /* ── Voice-to-Text ── */
  const handleVoiceResult = useCallback((text) => {
    setForm(prev => ({
      ...prev,
      content: prev.content + (prev.content && !prev.content.endsWith(' ') ? ' ' : '') + text,
    }));
  }, []);

  const handleVoiceError = useCallback((err) => {
    Alert.alert('Ses Tanıma Hatası', err);
  }, []);

  const { isListening, isAvailable: voiceAvailable, toggleListening } = useVoiceInput({
    lang: 'tr-TR',
    onResult: handleVoiceResult,
    onError: handleVoiceError,
  });

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const getTypeLabel = () => {
    if (analysisResult?.contract_type_display) return analysisResult.contract_type_display;
    return TYPE_LABELS[form.type] || form.type || 'Analiz Bekleniyor';
  };

  const validateStep = () => {
    const e = {};
    if (currentStep === 0) {
      // Başlık artık otomatik olarak analiz sonucundan üretiliyor (web ile
      // aynı davranış). Sadece sözleşme metni zorunlu.
      if (!form.content.trim()) e.content = 'Sözleşme metni gerekli';
    }
    if (currentStep === 2) {
      // Önizleme adımında karşı taraf bilgisi de zorunlu — bu sayede
      // backend `counterpartyTcKimlik` üzerinden onay akışını başlatabilir.
      if (!form.counterpartyTcKimlik || form.counterpartyTcKimlik.length !== 11) {
        e.counterpartyTcKimlik = 'Geçerli 11 haneli TC Kimlik No girin';
      }
      if (!form.counterpartyName.trim()) {
        e.counterpartyName = 'Karşı tarafın adı soyadı gerekli';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const result = await contractService.analyze(form.content);
      setAnalysisResult(result);

      if (result.contract_type) updateField('type', result.contract_type);

      const fields = result.nlp_result?.extracted_fields;
      if (fields) {
        if (fields.tutar && !form.amount) updateField('amount', fields.tutar);
        // counterpartyName analiz çıktısından otomatik doldurulmaz —
        // mahremiyet gereği karşı tarafın adını TC sorgusundan değil,
        // kullanıcının elle girmesinden alıyoruz.
      }
    } catch (error) {
      Alert.alert('Analiz Hatası', error.message || 'Metin analiz edilemedi. Devam edebilirsiniz.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleNext = async () => {
    if (!validateStep()) return;
    if (currentStep === 0) {
      setCurrentStep(1);
      if (!analysisResult) runAnalysis();
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
  };

  const handleBack = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const toggleSuggestion = (index) => {
    setSelectedSuggestions((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const setSuggestionValue = (index, value) => {
    setSuggestionValues((prev) => ({ ...prev, [index]: value }));
  };

  const getEnrichedContent = () => {
    const suggestions = analysisResult?.graphrag_result?.suggestions?.suggestions || [];
    const selectedEntries = suggestions
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => selectedSuggestions[i]);
    if (selectedEntries.length === 0) return form.content;
    // PDF'te insan-okur label kullan (örn. "Ödeme Yöntemi: ..."); kullanıcı
    // değer girmediyse [belirtilecek] olarak işaretle ki ne soru cümlesi
    // ne de boş kalsın.
    const additions = selectedEntries
      .map(({ s, i }) => {
        const v = (suggestionValues[i] || '').trim();
        const label = labelForClause(s) || s.field_name;
        return `\n\n${label}: ${v || '[belirtilecek]'}`;
      })
      .join('');
    return form.content + '\n\n--- Ek Maddeler ---' + additions;
  };

  const getClauseCount = () => {
    const matched = analysisResult?.graphrag_result?.analysis?.matched_fields || [];
    const selectedCount = Object.values(selectedSuggestions).filter(Boolean).length;
    return matched.length + selectedCount;
  };

  const handleSave = async () => {
    if (!validateStep()) return;
    setSaving(true);
    try {
      const enrichedContent = getEnrichedContent();
      // Başlık: kullanıcı yazmadıysa analiz sonucundan otomatik türet
      // (web frontendi de aynı pattern'i kullanıyor — bkz. CreateContractPage.jsx)
      const autoTitle =
        analysisResult?.contract_type_display ||
        TYPE_LABELS[form.type] ||
        TYPE_LABELS[analysisResult?.contract_type] ||
        'Yeni Sözleşme';
      const finalTitle = form.title.trim() || autoTitle;
      const finalType =
        form.type ||
        analysisResult?.contract_type ||
        'OTHER';
      const saved = await contractService.create({
        ...form,
        title: finalTitle,
        type: finalType,
        content: enrichedContent,
      });
      const newId = saved?.id || null;
      setSavedContractId(newId);

      // ÖNEMLİ: "Onaya Gönder" butonu yalnızca create() çağırıyordu — bu da
      // sözleşmeyi DRAFT durumunda bırakıyordu. Sonuç: karşı tarafın
      // "Onaylar" listesi (status=PENDING filter) boş kalıyor ve kullanıcı
      // sözleşmeyi onaylayamıyor. Burada create sonrası finalize() de çağrılır
      // ki sözleşme PENDING'e geçsin ve karşı taraf onay listesinde görsün.
      if (newId) {
        try {
          // Sahibin NFC ile doğrulanmış olması gerekir; backend bunu
          // zorluyor. Önceden kontrol et ve kullanıcıya net mesaj göster.
          const isVerified = await verificationService.isVerified();
          if (!isVerified) {
            // Kullanıcı henüz NFC doğrulaması yapmamış. Sözleşme DRAFT olarak
            // kayıtlı kaldı; doğrulama sonrası ContractDetailScreen'den
            // "Onaya Gönder" tekrar tıklanabilir.
            Alert.alert(
              'Kimlik Doğrulaması Gerekli',
              'Sözleşme taslak olarak kaydedildi. Karşı tarafa onay gönderebilmek için Ayarlar > Kimlik Doğrulama ekranında NFC ile doğrulama yapmanız gerekiyor.'
            );
          } else {
            await contractService.finalize(newId);
          }
        } catch (e) {
          // Finalize başarısız oldu (NFC doğrulaması yok veya backend hatası).
          // Sözleşme DRAFT olarak kayıtlı; kullanıcı detay ekranından
          // tekrar deneyebilir.
          console.warn('Finalize hatası:', e?.message);
          Alert.alert(
            'Bilgi',
            'Sözleşme kaydedildi ancak onaya gönderilemedi: ' +
              (e?.message || 'Bilinmeyen hata') +
              '. Sözleşmelerim ekranından detaya gidip tekrar gönderebilirsiniz.'
          );
        }
      }

      setCurrentStep(3);
    } catch (error) {
      Alert.alert('Hata', error.message || 'Sözleşme oluşturulamadı.');
    } finally {
      setSaving(false);
    }
  };

  const handleViewPdf = async () => {
    if (!savedContractId) return;
    setPdfLoading(true);
    try {
      const token = await SecureStore.getItemAsync('authToken');
      const pdfUrl = `${API_BASE_URL}/api/contracts/${savedContractId}/pdf`;
      const localPath = `${FileSystem.cacheDirectory}sozlesme_${savedContractId}.pdf`;
      await FileSystem.downloadAsync(pdfUrl, localPath, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await Sharing.shareAsync(localPath, { mimeType: 'application/pdf', dialogTitle: 'PDF Görüntüle' });
    } catch (e) {
      Alert.alert('Hata', 'PDF açılamadı: ' + (e.message || 'Bilinmeyen hata'));
    } finally {
      setPdfLoading(false);
    }
  };

  const handleTcKimlikChange = async (value) => {
    // Android'in numeric keyboard'ı bazı cihazlarda harf de geçirebiliyor —
    // burada zorla rakam dışındakileri sıyır ve 11 haneye kırp.
    const digits = (value || '').replace(/\D/g, '').slice(0, 11);
    updateField('counterpartyTcKimlik', digits);
    setTcLookupResult(null);
    if (digits.length === 11) {
      setTcLooking(true);
      try {
        const result = await contractService.lookupUserByTc(digits);
        setTcLookupResult(result || { found: false });
      } catch {
        // Network / 401 / 5xx — kullanıcıyı oturumdan düşürmeden
        // sessizce "bulunamadı" göster. (api.service.lookupUserByTc
        // skipAuthHandler:true kullanıyor.)
        setTcLookupResult({ found: false });
      } finally {
        setTcLooking(false);
      }
    }
  };

  const handleReset = () => {
    setCurrentStep(0);
    setForm({ title: '', type: '', content: '', amount: '', counterpartyName: '', counterpartyRole: '', counterpartyTcKimlik: '' });
    setErrors({});
    setAnalysisResult(null);
    setSelectedSuggestions({});
    setSuggestionValues({});
    setSavedContractId(null);
    setTcLookupResult(null);
  };

  // Step 1: Sözleşme Önerisi
  const renderStep1 = () => {
    if (analyzing) {
      return (
        <Card>
          <View style={styles.analyzingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.analyzingText}>Sözleşme analiz ediliyor...</Text>
            <Text style={styles.analyzingSubtext}>NLP ve GraphRAG ile akıllı analiz</Text>
          </View>
        </Card>
      );
    }

    if (!analysisResult) {
      return (
        <Card>
          <Text style={styles.stepTitle}>Sözleşme Önerisi</Text>
          <Text style={styles.stepDescription}>
            Sözleşme metninizi yapay zeka ile analiz edin. Eksik maddeler ve öneriler alın.
          </Text>
          <Button
            title="Analizi Başlat"
            variant="accent"
            onPress={runAnalysis}
            icon={<Ionicons name="sparkles" size={18} color={colors.textInverse} />}
            fullWidth
          />
        </Card>
      );
    }

    const graphRag = analysisResult.graphrag_result;
    const suggestions = graphRag?.suggestions?.suggestions || [];
    const matched = graphRag?.analysis?.matched_fields || [];
    const missingRequired = graphRag?.analysis?.missing_required || [];
    const extractedFields = analysisResult.nlp_result?.extracted_fields || {};

    const entityRows = Object.entries(extractedFields)
      .filter(([, v]) => v && (typeof v === 'string' || (Array.isArray(v) && v.length > 0)))
      .map(([k, v]) => ({
        label: ENTITY_LABELS[k] || k,
        value: Array.isArray(v) ? v.join(', ') : String(v),
      }));

    return (
      <>
        {/* NLP Analiz Sonucu */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="hardware-chip-outline" size={19} color={colors.primary} />
            <Text style={styles.sectionTitle}>NLP Analiz Sonucu</Text>
          </View>

          <Text style={styles.fieldLabel}>Tespit Edilen Sözleşme Tipi</Text>
          <View style={styles.contractTypeBox}>
            <Text style={styles.contractTypeText}>{getTypeLabel()}</Text>
          </View>

          {entityRows.length > 0 && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Çıkarılan Bilgiler (NER)</Text>
              {entityRows.map((row, i) => (
                <View
                  key={i}
                  style={[styles.entityRow, i < entityRows.length - 1 && styles.entityRowBorder]}
                >
                  <Text style={styles.entityLabel}>{row.label}</Text>
                  <Text style={styles.entityValue}>{row.value}</Text>
                </View>
              ))}
            </>
          )}

          {(matched.length > 0 || missingRequired.length > 0) && (
            <>
              <View style={[styles.sectionHeader, { marginTop: 16 }]}>
                <Ionicons name="flash" size={14} color={colors.accent} />
                <Text style={styles.subsectionTitle}>Zorunlu Maddeler</Text>
              </View>
              {/* labelForClause backend snake_case'i ("taraf_isveren") Türkçe
                  insan-okur label'a çevirir; field.name çoğu zaman boş geliyor
                  ve eskiden satırlar boş görünüyordu. */}
              {matched.map((field, i) => (
                <View key={i} style={styles.mandatoryItem}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={styles.mandatoryName}>
                    {labelForClause(field) || field.name || field.field_name || 'Madde'}
                  </Text>
                </View>
              ))}
              {missingRequired.map((field, i) => (
                <View key={i} style={[styles.mandatoryItem, styles.mandatoryItemMissing]}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={[styles.mandatoryName, { color: colors.error }]}>
                    {labelForClause(field) || field.name || field.field_name || 'Eksik Madde'}
                  </Text>
                </View>
              ))}
            </>
          )}
        </Card>

        {/* Önerilen Maddeler */}
        {suggestions.length > 0 && (
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="bulb-outline" size={19} color={colors.accent} />
              <Text style={styles.sectionTitle}>Önerilen Maddeler</Text>
            </View>
            <Text style={styles.stepDescription}>
              GraphRAG bilgi grafiği analizi sonucu önerilen maddeler. Eklemek istediklerinizi seçin.
            </Text>
            {suggestions.map((suggestion, index) => {
              const isChecked = !!selectedSuggestions[index];
              const isRecommended = suggestion.necessity === 'required';
              const friendlyLabel = labelForClause(suggestion) || suggestion.field_name;
              return (
                <View key={index} style={[styles.suggestionItem, isChecked && styles.suggestionItemSelected]}>
                  <TouchableOpacity
                    style={styles.suggestionRow}
                    onPress={() => toggleSuggestion(index)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                      {isChecked && <Ionicons name="checkmark" size={11} color="#fff" />}
                    </View>
                    <View style={styles.suggestionInfo}>
                      <View style={styles.suggestionNameRow}>
                        <Text style={styles.suggestionField}>{friendlyLabel}</Text>
                        {isRecommended && (
                          <View style={styles.recommendedBadge}>
                            <Text style={styles.recommendedBadgeText}>Tavsiye Edilen</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.suggestionMessage}>{suggestion.message}</Text>
                      {suggestion.usage_percent != null && (
                        <View style={styles.usageRow}>
                          <Ionicons name="stats-chart-outline" size={12} color={colors.textMuted} />
                          <Text style={styles.usageText}>
                            Kullanıcıların %{suggestion.usage_percent}'i ekledi
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                  {isChecked && (
                    <View style={styles.suggestionValueWrap}>
                      <Input
                        label={`${friendlyLabel} değeri`}
                        value={suggestionValues[index] || ''}
                        onChangeText={(v) => setSuggestionValue(index, v)}
                        placeholder={placeholderForClause(suggestion) || 'Bu madde için değer girin'}
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        )}

        <Button
          title="Tekrar Analiz Et"
          variant="outline"
          size="sm"
          onPress={() => { setAnalysisResult(null); runAnalysis(); }}
          icon={<Ionicons name="refresh" size={16} color={colors.primary} />}
          style={styles.reanalyzeButton}
        />
      </>
    );
  };

  // Başlık form.title boşsa analiz sonucundan otomatik türetilir;
  // önizleme/PDF preview ile handleSave tutarlı başlık göstersin diye
  // ortak bir helper.
  const resolveTitle = () => {
    const auto =
      analysisResult?.contract_type_display ||
      TYPE_LABELS[form.type] ||
      TYPE_LABELS[analysisResult?.contract_type] ||
      'Yeni Sözleşme';
    return (form.title.trim() || auto).toUpperCase();
  };

  // Step 2: PDF Önizleme
  const renderStep2 = () => {
    const clauseCount = getClauseCount();
    const today = new Date().toLocaleDateString('tr-TR');

    return (
      <>
        {/* Sözleşme Bilgileri */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Sözleşme Bilgileri</Text>
          {[
            { label: 'Tip', value: getTypeLabel() },
            { label: 'Taraflar', value: '2 kişi' },
            { label: 'Maddeler', value: clauseCount > 0 ? String(clauseCount) : '-' },
          ].map((row) => (
            <View key={row.label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={styles.infoValue}>{row.value}</Text>
            </View>
          ))}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Durum</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>Taslak</Text>
            </View>
          </View>
        </Card>

        {/* Sözleşme İçerik Önizlemesi */}
        <Card style={styles.previewPaper}>
          <Text style={styles.previewTitle}>{resolveTitle()}</Text>
          <Text style={styles.previewMeta}>Tarih: {today}</Text>
          <View style={styles.previewDivider} />
          <Text style={styles.previewContent}>{getEnrichedContent()}</Text>
        </Card>

        {/* Düzenle */}
        <Button
          title="Maddeleri Düzenle"
          variant="outline"
          fullWidth
          onPress={() => setCurrentStep(1)}
          style={{ marginBottom: 4 }}
        />
      </>
    );
  };

  // Step 3: Onay & İmza
  const renderStep3 = () => (
    <Card style={styles.successCard}>
      <View style={styles.successIconWrap}>
        <Ionicons name="checkmark-circle" size={56} color={colors.success} />
      </View>
      <Text style={styles.successTitle}>Sözleşme Oluşturuldu</Text>
      <Text style={styles.successDesc}>
        Sözleşmeniz başarıyla kaydedildi.
      </Text>
      {savedContractId && (
        <Button
          title={pdfLoading ? 'PDF Hazırlanıyor...' : 'PDF Görüntüle / İndir'}
          variant="accent"
          fullWidth
          loading={pdfLoading}
          onPress={handleViewPdf}
          icon={<Ionicons name="document-text-outline" size={18} color={colors.textInverse} />}
          style={{ marginBottom: 12 }}
        />
      )}
      <Button
        title="Sözleşmeleri Görüntüle"
        variant="outline"
        fullWidth
        onPress={() => navigation.navigate('Contracts')}
        style={{ marginBottom: 12 }}
      />
      <Button
        title="Yeni Sözleşme"
        variant="accent"
        fullWidth
        onPress={handleReset}
      />
    </Card>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <Card>
            <Text style={styles.stepTitle}>Sözleşmenizi Anlatın</Text>
            <Text style={styles.stepDescription}>
              Ne tür bir sözleşmeye ihtiyacınız olduğunu doğal dilde yazın. Yapay zekamız türü, başlığı ve detayları otomatik tespit edecek.
            </Text>
            <TextArea
              label="Sözleşme Metni"
              value={form.content}
              onChangeText={(v) => updateField('content', v)}
              placeholder="Sözleşmenizin içeriğini buraya yazın..."
              error={errors.content}
              numberOfLines={12}
              maxLength={5000}
            />
            {/* Mikrofon butonu */}
            {voiceAvailable && (
              <TouchableOpacity
                style={[styles.micButton, isListening && styles.micButtonActive]}
                onPress={toggleListening}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isListening ? 'mic' : 'mic-outline'}
                  size={20}
                  color={isListening ? '#fff' : colors.textMuted}
                />
                <Text style={[styles.micButtonText, isListening && styles.micButtonTextActive]}>
                  {isListening ? 'Dinleniyor...' : 'Sesle Yaz'}
                </Text>
              </TouchableOpacity>
            )}
          </Card>
        );
      case 1: return renderStep1();
      case 2: return (
        <>
          {renderStep2()}
          {renderCounterpartyCard()}
        </>
      );
      case 3: return renderStep3();
    }
  };

  // Karşı taraf bilgi kartı — step 2'de PDF önizlemesinin altında, kayıt
  // butonundan önce gösterilir. Web frontendi ile aynı pattern (bkz.
  // CreateContractPage.jsx).
  const renderCounterpartyCard = () => (
    <Card style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Ionicons name="people-outline" size={19} color={colors.primary} />
        <Text style={styles.sectionTitle}>Karşı Taraf Bilgileri</Text>
      </View>
      <Text style={styles.stepDescription}>
        Onay sürecini başlatabilmek için sözleşmenin karşı tarafının kimliğini girin.
      </Text>
      <Input
        label="Karşı Taraf TC Kimlik No"
        value={form.counterpartyTcKimlik}
        onChangeText={handleTcKimlikChange}
        placeholder="11 haneli TC Kimlik Numarası"
        keyboardType="numeric"
        maxLength={11}
        error={errors.counterpartyTcKimlik}
      />
      {tcLooking && (
        <View style={styles.tcLookupRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.tcLookupText}>Kullanıcı aranıyor...</Text>
        </View>
      )}
      {tcLookupResult && (
        <View style={[styles.tcLookupRow, tcLookupResult.found ? styles.tcFound : styles.tcNotFound]}>
          <Ionicons
            name={tcLookupResult.found ? 'checkmark-circle' : 'warning'}
            size={16}
            color={tcLookupResult.found ? colors.success : colors.warning}
          />
          <Text style={[styles.tcLookupText, { color: tcLookupResult.found ? colors.success : colors.warning }]}>
            {tcLookupResult.found
              ? `Kullanıcı bulundu: ${tcLookupResult.displayName}`
              : 'Bu TC Kimlik No\'ya ait kayıtlı kullanıcı bulunamadı. Onay gönderilemeyecek; karşı taraf önce kayıt olmalı.'}
          </Text>
        </View>
      )}
      <Input
        label="Ad Soyad"
        value={form.counterpartyName}
        onChangeText={(v) => updateField('counterpartyName', v)}
        placeholder="Karşı tarafın adı ve soyadı"
        error={errors.counterpartyName}
      />
      <Input
        label="Rol (Opsiyonel)"
        value={form.counterpartyRole}
        onChangeText={(v) => updateField('counterpartyRole', v)}
        placeholder="Ör: Kiracı, İşveren, Alıcı"
      />
    </Card>
  );

  const isAnalyzingStep = currentStep === 1 && analyzing;
  const isLastStep = currentStep === TOTAL_STEPS - 1;
  const showSaveButton = currentStep === 2;

  return (
    <ScreenWrapper>
      {/* Android: native adjustResize klavye davranışını yönetir; behavior="height"
          ile birlikte offset kalıcı boşluk bıraktığı için Android'de behavior
          uygulamıyoruz. iOS'te padding + tab bar offset gerekiyor. */}
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? tabBarHeight : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Header title="Yeni Sözleşme" subtitle="Adım adım sözleşme oluşturun" />
          <StepIndicator currentStep={currentStep} steps={stepLabels} />

          {renderStep()}

          {!isLastStep && (
            <View style={styles.actions}>
              {currentStep > 0 && !isAnalyzingStep && (
                <Button
                  title="Geri"
                  variant="outline"
                  onPress={handleBack}
                  icon={<Ionicons name="arrow-back" size={18} color={colors.primary} />}
                  style={styles.actionButton}
                />
              )}
              {showSaveButton ? (
                <Button
                  title="Onaya Gönder"
                  variant="accent"
                  onPress={handleSave}
                  loading={saving}
                  icon={<Ionicons name="send" size={16} color={colors.textInverse} />}
                  style={[styles.actionButton, styles.actionButtonRight]}
                />
              ) : (
                <Button
                  title={currentStep === 0 ? 'Analiz Et' : 'İleri'}
                  variant="accent"
                  onPress={handleNext}
                  loading={isAnalyzingStep}
                  disabled={isAnalyzingStep}
                  icon={
                    currentStep === 0
                      ? <Ionicons name="sparkles" size={18} color={colors.textInverse} />
                      : undefined
                  }
                  style={[
                    styles.actionButton,
                    currentStep > 0 && !isAnalyzingStep && styles.actionButtonRight,
                  ]}
                />
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  kav: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  tcLookupRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  tcFound: { backgroundColor: 'rgba(34,197,94,0.08)' },
  tcNotFound: { backgroundColor: 'rgba(245,158,11,0.08)' },
  tcLookupText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },

  // Mic button
  micButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    marginTop: 8,
  },
  micButtonActive: {
    backgroundColor: '#ef4444',
  },
  micButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textMuted,
  },
  micButtonTextActive: {
    color: '#fff',
  },

  stepTitle: {
    fontFamily: fonts.headingMedium,
    fontSize: 18,
    color: colors.text,
    marginBottom: 8,
  },
  stepDescription: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },

  // Section cards
  sectionCard: { marginBottom: 14 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: fonts.headingMedium,
    fontSize: 16,
    color: colors.text,
  },
  subsectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.text,
  },

  // Contract type box
  fieldLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 8,
  },
  contractTypeBox: {
    backgroundColor: 'rgba(200, 150, 62, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(200, 150, 62, 0.2)',
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  contractTypeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.text,
  },

  // NER entity rows
  entityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  entityRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  entityLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  entityValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.text,
    textAlign: 'right',
  },

  // Mandatory clauses
  mandatoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
  },
  mandatoryItemMissing: {
    backgroundColor: colors.errorBg,
  },
  mandatoryName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },

  // Suggestion items
  suggestionItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
    backgroundColor: colors.surface,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  suggestionValueWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  suggestionItemSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(27, 42, 74, 0.04)',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  suggestionInfo: { flex: 1 },
  suggestionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
    flexWrap: 'wrap',
  },
  suggestionField: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  suggestionMessage: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  usageText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  recommendedBadge: {
    backgroundColor: colors.warningBg,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  recommendedBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.warning,
  },

  reanalyzeButton: { marginTop: 4 },

  // Analyzing state
  analyzingContainer: { alignItems: 'center', paddingVertical: 40 },
  analyzingText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.text,
    marginTop: 16,
  },
  analyzingSubtext: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },

  // Step 2: PDF Önizleme
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
  },
  infoValue: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.text,
  },
  statusBadge: {
    backgroundColor: colors.warningBg,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  statusBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.warning,
  },
  previewPaper: {
    marginBottom: 14,
    backgroundColor: colors.card,
  },
  previewTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  previewMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 14,
  },
  previewDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  previewContent: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
    lineHeight: 21,
  },

  // Step 3: Success
  successCard: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  successIconWrap: { marginBottom: 16 },
  successTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  successDesc: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 21,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  actionButton: { flex: 1 },
  actionButtonRight: { marginLeft: 12 },
});
