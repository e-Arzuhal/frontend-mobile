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
import { colors, fonts, radius, shadows } from '../styles/tokens';
import Header from '../components/Header';
import Card from '../components/Card';
import Badge from '../components/Badge';
import Button from '../components/Button';
import ScreenWrapper from '../components/ScreenWrapper';
import contractService from '../services/contract.service';

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

  useEffect(() => {
    loadContract();
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

  const handleFinalize = () => {
    Alert.alert(
      'Onaya Gönder',
      'Bu sözleşmeyi onaya göndermek istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Gönder',
          onPress: async () => {
            setActionLoading(true);
            try {
              await contractService.finalize(contractId);
              loadContract();
            } catch (error) {
              Alert.alert('Hata', error.message || 'İşlem başarısız.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
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
            <Text style={styles.partyName}>{contract.ownerUsername || 'Siz'}</Text>
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
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
  },
});
