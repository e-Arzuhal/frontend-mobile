import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import { colors, fonts, radius, shadows } from '../styles/tokens';
import Header from '../components/Header';
import Card from '../components/Card';
import Badge from '../components/Badge';
import Button from '../components/Button';
import ScreenWrapper from '../components/ScreenWrapper';
import contractService from '../services/contract.service';
import verificationService from '../services/verification.service';
import { API_BASE_URL } from '../config/api.config';
import { labelForClause } from '../utils/clauseLabels';

const typeLabels = {
  SALES: 'Satış Sözleşmesi',
  RENTAL: 'Kira Sözleşmesi',
  SERVICE: 'Hizmet Sözleşmesi',
  EMPLOYMENT: 'İş Sözleşmesi',
  NDA: 'Gizlilik Sözleşmesi',
  OTHER: 'Diğer',
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function ContractDetailScreen({ route, navigation }) {
  const { contractId } = route.params;
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [requiredClauses, setRequiredClauses] = useState(null);
  const [loadingClauses, setLoadingClauses] = useState(false);

  useEffect(() => {
    loadContract();
    loadRequiredClauses();
  }, [contractId]);

  const loadContract = async () => {
    try {
      const data = await contractService.getById(contractId);
      setContract(data);
    } catch (error) {
      Alert.alert('Hata', 'Sözleşme yüklenemedi.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const loadRequiredClauses = async () => {
    setLoadingClauses(true);
    try {
      const data = await contractService.getRequiredClauses(contractId);
      setRequiredClauses(data);
    } catch {
      setRequiredClauses(null);
    } finally {
      setLoadingClauses(false);
    }
  };

  const handleFinalize = async () => {
    // Verification gate: check if user is verified before finalizing
    setActionLoading(true);
    try {
      const verified = await verificationService.isVerified();
      if (!verified) {
        setActionLoading(false);
        Alert.alert(
          'Kimlik Doğrulaması Gerekli',
          'Sözleşmeyi onaya göndermek için kimlik doğrulaması yapmanız gerekiyor. Kimlik doğrulama ekranına yönlendirileceksiniz.',
          [
            { text: 'İptal', style: 'cancel' },
            {
              text: 'Doğrulamaya Git',
              onPress: () => {
                navigation.navigate('Settings', {
                  screen: 'Verification',
                  params: {
                    contractGate: true,
                    onVerified: () => performFinalize(),
                  },
                });
              },
            },
          ]
        );
        return;
      }
    } catch {
      // If status check fails, still allow finalize (backend will enforce)
    }
    setActionLoading(false);

    Alert.alert(
      'Onaya Gönder',
      'Bu sözleşmeyi onaya göndermek istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Gönder', onPress: () => performFinalize() },
      ]
    );
  };

  const performFinalize = async () => {
    setActionLoading(true);
    try {
      await contractService.finalize(contractId);
      loadContract();
    } catch (error) {
      Alert.alert('Hata', error.message || 'İşlem başarısız.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewPdf = async () => {
    if (!contract?.id) return;
    setPdfLoading(true);
    try {
      const token = await SecureStore.getItemAsync('authToken');
      const pdfUrl = `${API_BASE_URL}/api/contracts/${contract.id}/pdf`;
      const localPath = `${FileSystem.cacheDirectory}sozlesme_${contract.id}.pdf`;
      await FileSystem.downloadAsync(pdfUrl, localPath, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await Sharing.shareAsync(localPath, {
        mimeType: 'application/pdf',
        dialogTitle: 'PDF Görüntüle / İndir',
      });
    } catch (e) {
      Alert.alert('Hata', 'PDF açılamadı: ' + (e.message || 'Bilinmeyen hata'));
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Sil',
      'Bu sözleşmeyi silmek istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await contractService.delete(contractId);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Hata', error.message || 'Silme başarısız.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!contract) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header
        title={contract.title}
        subtitle={typeLabels[contract.type] || contract.type}
        right={<Badge status={contract.status} />}
      />

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Genel Bilgiler</Text>
        <DetailRow label="Durum" value={<Badge status={contract.status} />} />
        <DetailRow label="Tür" value={typeLabels[contract.type] || contract.type} />
        {contract.amount && <DetailRow label="Tutar" value={contract.amount} />}
        <DetailRow label="Oluşturulma" value={formatDate(contract.createdAt)} />
        <DetailRow label="Son Güncelleme" value={formatDate(contract.updatedAt)} />
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Taraflar</Text>
        <View style={styles.partyCard}>
          <Ionicons name="person" size={20} color={colors.primary} />
          <View style={styles.partyInfo}>
            <Text style={styles.partyName}>
              {contract.ownerFullName || contract.ownerUsername || 'Siz'}
            </Text>
            <Text style={styles.partyRole}>Sözleşme Sahibi</Text>
          </View>
        </View>
        {contract.counterpartyName && (
          <View style={styles.partyCard}>
            <Ionicons name="person-outline" size={20} color={colors.accent} />
            <View style={styles.partyInfo}>
              <Text style={styles.partyName}>{contract.counterpartyName}</Text>
              <Text style={styles.partyRole}>{contract.counterpartyRole || 'Karşı Taraf'}</Text>
            </View>
          </View>
        )}
      </Card>

      {contract.content && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Sözleşme İçeriği</Text>
          <Text style={styles.contentText}>{contract.content}</Text>
        </Card>
      )}

      <Card style={styles.section}>
        <View style={styles.clausesHeaderRow}>
          <Text style={styles.sectionTitle}>Bulunması Gereken Maddeler</Text>
          <Text style={styles.clausesSourceText}>GraphRAG</Text>
        </View>
        {loadingClauses && (
          <Text style={styles.mutedText}>Madde rehberi yükleniyor...</Text>
        )}
        {!loadingClauses && requiredClauses && requiredClauses.available === false && (
          <Text style={styles.mutedText}>
            {requiredClauses.message || 'Madde rehberi şu anda erişilemiyor.'}
          </Text>
        )}
        {!loadingClauses && requiredClauses && requiredClauses.available !== false && (
          <View>
            <Text style={styles.clauseGroupTitle}>Zorunlu Maddeler</Text>
            {(requiredClauses.mandatoryClauses || []).length === 0 ? (
              <Text style={styles.mutedText}>Tanımlı zorunlu madde bulunamadı.</Text>
            ) : (
              (requiredClauses.mandatoryClauses || []).map((c, i) => (
                <View key={`m-${i}`} style={[styles.clauseRow, styles.clauseRowMandatory]}>
                  <Text style={styles.clauseName}>{labelForClause(c.name || c.clause) || `Madde ${i + 1}`}</Text>
                  {!!c.description && (
                    <Text style={styles.clauseDescription}>{c.description}</Text>
                  )}
                </View>
              ))
            )}

            {(requiredClauses.optionalClauses || []).length > 0 && (
              <>
                <Text style={[styles.clauseGroupTitle, { marginTop: 14 }]}>
                  Opsiyonel Maddeler
                </Text>
                {(requiredClauses.optionalClauses || []).map((c, i) => (
                  <View key={`o-${i}`} style={styles.clauseRow}>
                    <Text style={styles.clauseName}>{labelForClause(c.name || c.clause) || `Madde ${i + 1}`}</Text>
                    {!!c.description && (
                      <Text style={styles.clauseDescription}>{c.description}</Text>
                    )}
                  </View>
                ))}
              </>
            )}

            {(requiredClauses.lawArticles || []).length > 0 && (
              <>
                <Text style={[styles.clauseGroupTitle, { marginTop: 14 }]}>
                  İlgili Kanun Maddeleri
                </Text>
                {(requiredClauses.lawArticles || []).slice(0, 6).map((a, i) => (
                  <View key={`l-${i}`} style={styles.clauseRow}>
                    <Text style={styles.clauseName}>
                      {(a.law_name || '') + ' ' + (a.article_number || '')}
                    </Text>
                    {!!a.summary && (
                      <Text style={styles.clauseDescription}>{a.summary}</Text>
                    )}
                  </View>
                ))}
              </>
            )}
          </View>
        )}
      </Card>

      {/* PDF Görüntüle / İndir — her durumda göster, kayıtlı her sözleşme
          için backend PDF üretiyor. Status'tan bağımsız. */}
      <Button
        title={pdfLoading ? 'PDF Hazırlanıyor...' : 'PDF Görüntüle / İndir'}
        variant="accent"
        fullWidth
        loading={pdfLoading}
        onPress={handleViewPdf}
        icon={<Ionicons name="document-text-outline" size={18} color={colors.textInverse} />}
        style={styles.pdfButton}
      />

      {contract.status === 'DRAFT' && (
        <View style={styles.actions}>
          <Button
            title="Onaya Gönder"
            variant="accent"
            onPress={handleFinalize}
            loading={actionLoading}
            icon={<Ionicons name="send" size={18} color={colors.textInverse} />}
            style={styles.actionButton}
          />
          <Button
            title="Sil"
            variant="danger"
            onPress={handleDelete}
            loading={actionLoading}
            icon={<Ionicons name="trash" size={18} color={colors.textInverse} />}
            style={styles.actionButton}
          />
        </View>
      )}
    </ScrollView>
  );
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      {typeof value === 'string' ? (
        <Text style={styles.detailValue}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: fonts.headingMedium,
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  detailValue: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    maxWidth: '60%',
    textAlign: 'right',
  },
  partyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  partyInfo: {
    marginLeft: 12,
  },
  partyName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
  partyRole: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  contentText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  pdfButton: {
    marginTop: 8,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
  },
  clausesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  clausesSourceText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
  },
  clauseGroupTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.text,
    marginBottom: 8,
  },
  clauseRow: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 6,
  },
  clauseRowMandatory: {
    backgroundColor: 'rgba(34, 139, 34, 0.08)',
  },
  clauseName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.text,
  },
  clauseDescription: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },
  mutedText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
  },
});
