import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadows } from '../styles/tokens';
import Header from '../components/Header';
import Card from '../components/Card';
import Input from '../components/Input';
import TextArea from '../components/TextArea';
import Button from '../components/Button';
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

  const handleNext = () => {
    if (!validateStep()) return;
    setCurrentStep((prev) => Math.min(prev + 1, 3));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await contractService.create(form);
      Alert.alert('Başarılı', 'Sözleşme başarıyla oluşturuldu.', [
        { text: 'Tamam', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert('Hata', error.message || 'Sözleşme oluşturulamadı.');
    } finally {
      setSaving(false);
    }
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
            <View style={styles.previewDivider} />
            <Text style={styles.previewLabel}>İçerik:</Text>
            <Text style={styles.previewContent}>{form.content}</Text>
          </Card>
        );
    }
  };

  return (
    <ScreenWrapper>
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Header
          title="Yeni Sözleşme"
          subtitle="Adım adım sözleşme oluşturun"
        />

        <StepIndicator currentStep={currentStep} />

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
          {currentStep < 3 ? (
            <Button
              title="İleri"
              variant="accent"
              onPress={handleNext}
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
  content: {
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
