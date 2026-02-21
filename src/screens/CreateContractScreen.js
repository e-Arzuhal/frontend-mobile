import React, { useState } from 'react';
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
import { colors, fonts, radius, shadows } from '../styles/tokens';
import Header from '../components/Header';
import Card from '../components/Card';
import Input from '../components/Input';
import TextArea from '../components/TextArea';
import Button from '../components/Button';
import ProgressBar from '../components/ProgressBar';
import StepIndicator from '../components/StepIndicator';
import ScreenWrapper from '../components/ScreenWrapper';
import contractService from '../services/contract.service';

const TOTAL_STEPS = 4;
const stepLabels = ['Metin Girişi', 'AI Analiz', 'Taraflar', 'Önizleme'];

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

export default function CreateContractScreen({ navigation }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    type: '',
    content: '',
    amount: '',
    counterpartyName: '',
    counterpartyRole: '',
  });
  const [errors, setErrors] = useState({});

  // AI Analiz state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState({});

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
      if (!form.title.trim()) e.title = 'Başlık gerekli';
      if (!form.content.trim()) e.content = 'Sözleşme metni gerekli';
    } else if (currentStep === 2) {
      if (!form.counterpartyName.trim()) e.counterpartyName = 'Karşı taraf adı gerekli';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const result = await contractService.analyze(form.content);
      setAnalysisResult(result);

      // NLP'den gelen tipi ve entity'leri form'a uygula
      if (result.contract_type) {
        updateField('type', result.contract_type);
      }

      const fields = result.nlp_result?.extracted_fields;
      if (fields) {
        if (fields.tutar && !form.amount) updateField('amount', fields.tutar);
        if (fields.taraflar?.length && !form.counterpartyName) {
          updateField('counterpartyName', fields.taraflar[0]);
        }
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
      if (!analysisResult) {
        runAnalysis();
      }
      return;
    }

    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const toggleSuggestion = (index) => {
    setSelectedSuggestions((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const getEnrichedContent = () => {
    const suggestions = analysisResult?.graphrag_result?.suggestions?.suggestions || [];
    const selected = suggestions.filter((_, i) => selectedSuggestions[i]);
    if (selected.length === 0) return form.content;

    const additions = selected.map((s) => `\n\n[${s.field_name}]: ${s.message}`).join('');
    return form.content + '\n\n--- Ek Maddeler ---' + additions;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const enrichedContent = getEnrichedContent();
      await contractService.create({ ...form, content: enrichedContent });
      Alert.alert('Başarılı', 'Sözleşme başarıyla oluşturuldu.', [
        { text: 'Tamam', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert('Hata', error.message || 'Sözleşme oluşturulamadı.');
    } finally {
      setSaving(false);
    }
  };

  const renderAnalysisStep = () => {
    if (analyzing) {
      return (
        <Card>
          <View style={styles.analyzingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.analyzingText}>Sözleşme metni analiz ediliyor...</Text>
            <Text style={styles.analyzingSubtext}>NLP ve GraphRAG ile akıllı analiz</Text>
          </View>
        </Card>
      );
    }

    if (!analysisResult) {
      return (
        <Card>
          <Text style={styles.stepTitle}>AI Analiz</Text>
          <Text style={styles.analyzeDescription}>
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
    const completeness = analysisResult.completeness_score || 0;
    const suggestions = graphRag?.suggestions?.suggestions || [];
    const matched = graphRag?.analysis?.matched_fields || [];
    const missingRequired = graphRag?.analysis?.missing_required || [];

    return (
      <>
        {/* Tamamlanma Skoru */}
        <Card style={styles.analysisCard}>
          <Text style={styles.stepTitle}>AI Analiz Sonucu</Text>
          <ProgressBar
            progress={completeness}
            label="Tamamlanma"
            color={completeness >= 80 ? colors.success : completeness >= 50 ? colors.warning : colors.error}
          />
          <Text style={styles.detectedType}>
            Tespit edilen tür: {getTypeLabel()}
          </Text>
        </Card>

        {/* Tespit Edilen Alanlar */}
        {matched.length > 0 && (
          <Card style={styles.analysisCard}>
            <Text style={styles.sectionLabel}>Tespit Edilen Bilgiler</Text>
            {matched.map((field, i) => (
              <View key={i} style={styles.fieldRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={styles.fieldText}>{field.name || field.field_name}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Eksik Zorunlu Alanlar */}
        {missingRequired.length > 0 && (
          <Card style={styles.analysisCard}>
            <Text style={styles.sectionLabel}>Eksik Zorunlu Bilgiler</Text>
            {missingRequired.map((field, i) => (
              <View key={i} style={styles.fieldRow}>
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={styles.fieldTextMissing}>{field.name || field.field_name}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Öneriler - Seçilebilir */}
        {suggestions.length > 0 && (
          <Card style={styles.analysisCard}>
            <Text style={styles.sectionLabel}>Öneriler</Text>
            <Text style={styles.suggestionHint}>Eklemek istediklerinizi seçin:</Text>
            {suggestions.map((suggestion, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.suggestionItem,
                  selectedSuggestions[index] && styles.suggestionItemSelected,
                ]}
                onPress={() => toggleSuggestion(index)}
                activeOpacity={0.7}
              >
                <View style={styles.suggestionHeader}>
                  <Ionicons
                    name={selectedSuggestions[index] ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={selectedSuggestions[index] ? colors.accent : colors.textMuted}
                  />
                  <View style={styles.suggestionInfo}>
                    <Text style={styles.suggestionField}>{suggestion.field_name}</Text>
                    <Text style={styles.suggestionMessage}>{suggestion.message}</Text>
                  </View>
                  {suggestion.necessity === 'required' && (
                    <View style={styles.requiredBadge}>
                      <Text style={styles.requiredBadgeText}>Zorunlu</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </Card>
        )}

        {/* Tekrar analiz */}
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

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <Card>
            <Text style={styles.stepTitle}>Sözleşmenizi Anlatın</Text>
            <Text style={styles.stepDescription}>
              Ne tür bir sözleşmeye ihtiyacınız olduğunu doğal dilde yazın. Yapay zekamız türü ve detayları otomatik tespit edecek.
            </Text>
            <Input
              label="Sözleşme Başlığı"
              value={form.title}
              onChangeText={(v) => updateField('title', v)}
              placeholder="Ör: Kira Sözleşmesi - Nisan 2026"
              error={errors.title}
            />
            <TextArea
              label="Sözleşme Metni"
              value={form.content}
              onChangeText={(v) => updateField('content', v)}
              placeholder="Sözleşmenizin içeriğini buraya yazın. Örnek: 'Ahmet Yılmaz ile Ayşe Kaya arasında İstanbul Kadıköy'deki daireyi aylık 15.000 TL'ye, 1 yıllığına kiralama sözleşmesi yapılacaktır...'"
              error={errors.content}
              numberOfLines={12}
              maxLength={5000}
            />
          </Card>
        );

      case 1:
        return renderAnalysisStep();

      case 2:
        return (
          <Card>
            <Text style={styles.stepTitle}>Taraflar</Text>
            {analysisResult && (
              <View style={styles.nlpHintBox}>
                <Ionicons name="sparkles" size={14} color={colors.accent} />
                <Text style={styles.nlpHintText}>
                  AI tarafından tespit edilen bilgiler ön dolduruldu. Düzenleyebilirsiniz.
                </Text>
              </View>
            )}
            <Input
              label="Karşı Taraf Adı"
              value={form.counterpartyName}
              onChangeText={(v) => updateField('counterpartyName', v)}
              placeholder="Kişi veya kurum adı"
              error={errors.counterpartyName}
              icon={<Ionicons name="person-outline" size={20} color={colors.textMuted} />}
            />
            <Input
              label="Karşı Taraf Rolü"
              value={form.counterpartyRole}
              onChangeText={(v) => updateField('counterpartyRole', v)}
              placeholder="Ör: Kiracı, Müşteri, Çalışan"
              icon={<Ionicons name="briefcase-outline" size={20} color={colors.textMuted} />}
            />
            <Input
              label="Tutar (Opsiyonel)"
              value={form.amount}
              onChangeText={(v) => updateField('amount', v)}
              placeholder="Ör: 15000"
              keyboardType="numeric"
              icon={<Ionicons name="cash-outline" size={20} color={colors.textMuted} />}
            />
          </Card>
        );

      case 3:
        return (
          <Card>
            <Text style={styles.stepTitle}>Önizleme</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Başlık:</Text>
              <Text style={styles.previewValue}>{form.title}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Tür:</Text>
              <Text style={styles.previewValue}>{getTypeLabel()}</Text>
            </View>
            {form.amount ? (
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Tutar:</Text>
                <Text style={styles.previewValue}>{form.amount}</Text>
              </View>
            ) : null}
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Karşı Taraf:</Text>
              <Text style={styles.previewValue}>
                {form.counterpartyName}
                {form.counterpartyRole ? ` (${form.counterpartyRole})` : ''}
              </Text>
            </View>
            {analysisResult?.completeness_score != null && (
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Tamamlanma:</Text>
                <Text style={styles.previewValue}>%{analysisResult.completeness_score}</Text>
              </View>
            )}
            <View style={styles.previewDivider} />
            <Text style={styles.previewLabel}>İçerik:</Text>
            <Text style={styles.previewContent}>{getEnrichedContent()}</Text>
          </Card>
        );
    }
  };

  const lastStep = TOTAL_STEPS - 1;
  const isAnalyzing = currentStep === 1 && analyzing;

  return (
    <ScreenWrapper>
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Header
          title="Yeni Sözleşme"
          subtitle="Adım adım sözleşme oluşturun"
        />

        <StepIndicator currentStep={currentStep} steps={stepLabels} />

        {renderStep()}

        <View style={styles.actions}>
          {currentStep > 0 && !isAnalyzing && (
            <Button
              title="Geri"
              variant="outline"
              onPress={handleBack}
              icon={<Ionicons name="arrow-back" size={18} color={colors.primary} />}
              style={styles.actionButton}
            />
          )}
          {currentStep < lastStep ? (
            <Button
              title={currentStep === 0 ? 'Analiz Et' : 'İleri'}
              variant="accent"
              onPress={handleNext}
              loading={isAnalyzing}
              disabled={isAnalyzing}
              icon={currentStep === 0 ? <Ionicons name="sparkles" size={18} color={colors.textInverse} /> : undefined}
              style={[styles.actionButton, currentStep > 0 && !isAnalyzing && styles.actionButtonRight]}
            />
          ) : (
            <Button
              title="Kaydet"
              variant="success"
              onPress={handleSave}
              loading={saving}
              icon={<Ionicons name="checkmark" size={18} color={colors.textInverse} />}
              style={[styles.actionButton, styles.actionButtonRight]}
            />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  kav: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  stepTitle: {
    fontFamily: fonts.headingMedium,
    fontSize: 18,
    color: colors.text,
    marginBottom: 8,
  },
  stepDescription: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
    lineHeight: 21,
  },
  // Analysis step
  analysisCard: {
    marginBottom: 14,
  },
  analyzingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
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
  analyzeDescription: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
    lineHeight: 21,
  },
  detectedType: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  sectionLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
    marginBottom: 12,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  fieldText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
  },
  fieldTextMissing: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.error,
  },
  suggestionHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  suggestionItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    backgroundColor: colors.surface,
  },
  suggestionItemSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  suggestionInfo: {
    flex: 1,
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
    marginTop: 3,
    lineHeight: 19,
  },
  requiredBadge: {
    backgroundColor: colors.errorBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  requiredBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.error,
  },
  reanalyzeButton: {
    marginTop: 4,
  },
  // NLP hint
  nlpHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accentMuted,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  nlpHintText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.accent,
    flex: 1,
  },
  // Preview
  previewRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  previewLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textSecondary,
    width: 100,
  },
  previewValue: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  previewDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  previewContent: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  actionButton: {
    flex: 1,
  },
  actionButtonRight: {
    marginLeft: 12,
  },
});
