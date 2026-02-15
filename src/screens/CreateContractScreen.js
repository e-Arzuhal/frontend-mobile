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

const contractTypes = [
  { value: 'SALES', label: 'Satış Sözleşmesi' },
  { value: 'RENTAL', label: 'Kira Sözleşmesi' },
  { value: 'SERVICE', label: 'Hizmet Sözleşmesi' },
  { value: 'EMPLOYMENT', label: 'İş Sözleşmesi' },
  { value: 'NDA', label: 'Gizlilik Sözleşmesi' },
  { value: 'OTHER', label: 'Diğer' },
];

const TOTAL_STEPS = 5; // 0-4
const stepLabels = ['Bilgiler', 'Taraflar', 'İçerik', 'AI Analiz', 'Önizleme'];

export default function CreateContractScreen({ navigation }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    type: 'SALES',
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

  const validateStep = () => {
    const e = {};
    if (currentStep === 0) {
      if (!form.title.trim()) e.title = 'Başlık gerekli';
    } else if (currentStep === 1) {
      if (!form.counterpartyName.trim()) e.counterpartyName = 'Karşı taraf adı gerekli';
    } else if (currentStep === 2) {
      if (!form.content.trim()) e.content = 'Sözleşme içeriği gerekli';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const result = await contractService.analyze(form.content);
      setAnalysisResult(result);

      // NLP'den gelen tipi form'a uygula
      if (result.contract_type && result.contract_type !== form.type) {
        updateField('type', result.contract_type);
      }

      // NLP'den gelen entity'leri form'a uygula
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

    // Step 2'den 3'e geçerken otomatik analiz başlat
    if (currentStep === 2 && !analysisResult) {
      setCurrentStep(3);
      runAnalysis();
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
            Tespit edilen tür: {contractTypes.find((t) => t.value === analysisResult.contract_type)?.label || analysisResult.contract_type_display}
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
            <Text style={styles.stepTitle}>Temel Bilgiler</Text>
            <Input
              label="Sözleşme Başlığı"
              value={form.title}
              onChangeText={(v) => updateField('title', v)}
              placeholder="Sözleşmenin başlığını girin"
              error={errors.title}
            />
            <Text style={styles.fieldLabel}>Sözleşme Türü</Text>
            <View style={styles.typeGrid}>
              {contractTypes.map((type) => (
                <Button
                  key={type.value}
                  title={type.label}
                  variant={form.type === type.value ? 'accent' : 'outline'}
                  size="sm"
                  onPress={() => updateField('type', type.value)}
                  style={styles.typeButton}
                />
              ))}
            </View>
            <Input
              label="Tutar"
              value={form.amount}
              onChangeText={(v) => updateField('amount', v)}
              placeholder="Opsiyonel"
              keyboardType="numeric"
              icon={<Ionicons name="cash-outline" size={20} color={colors.textMuted} />}
            />
          </Card>
        );
      case 1:
        return (
          <Card>
            <Text style={styles.stepTitle}>Taraflar</Text>
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
          </Card>
        );
      case 2:
        return (
          <Card>
            <Text style={styles.stepTitle}>Sözleşme İçeriği</Text>
            <TextArea
              label="İçerik"
              value={form.content}
              onChangeText={(v) => updateField('content', v)}
              placeholder="Sözleşme maddelerini ve detaylarını yazın..."
              error={errors.content}
              numberOfLines={10}
              maxLength={5000}
            />
          </Card>
        );
      case 3:
        return renderAnalysisStep();
      case 4:
        return (
          <Card>
            <Text style={styles.stepTitle}>Önizleme</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Başlık:</Text>
              <Text style={styles.previewValue}>{form.title}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Tür:</Text>
              <Text style={styles.previewValue}>
                {contractTypes.find((t) => t.value === form.type)?.label}
              </Text>
            </View>
            {form.amount && (
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Tutar:</Text>
                <Text style={styles.previewValue}>{form.amount}</Text>
              </View>
            )}
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
          {currentStep > 0 && (
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
              title={currentStep === 2 ? 'Analiz Et' : 'İleri'}
              variant="accent"
              onPress={handleNext}
              loading={analyzing}
              icon={currentStep === 2 ? <Ionicons name="sparkles" size={18} color={colors.textInverse} /> : undefined}
              style={[styles.actionButton, styles.actionButtonRight]}
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
    marginBottom: 20,
  },
  fieldLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
    marginBottom: 8,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  typeButton: {
    marginBottom: 4,
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
