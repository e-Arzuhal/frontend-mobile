import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadows } from '../styles/tokens';
import Header from '../components/Header';
import Card from '../components/Card';
import Badge from '../components/Badge';
import Button from '../components/Button';
import contractService from '../services/contract.service';

const typeLabels = {
  SALES: 'Satış',
  RENTAL: 'Kira',
  SERVICE: 'Hizmet',
  EMPLOYMENT: 'İş',
  NDA: 'Gizlilik',
  OTHER: 'Diğer',
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function ApprovalsScreen() {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const loadApprovals = async () => {
    try {
      const data = await contractService.getPendingApprovals();
      setApprovals(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Onaylar yükleme hatası:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadApprovals();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadApprovals();
  };

  const handleApprove = (id) => {
    Alert.alert('Onayla', 'Bu sözleşmeyi onaylamak istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Onayla',
        onPress: async () => {
          setActionLoadingId(id);
          try {
            await contractService.approve(id);
            setApprovals((prev) => prev.filter((a) => a.id !== id));
          } catch (error) {
            Alert.alert('Hata', error.message || 'Onaylama başarısız.');
          } finally {
            setActionLoadingId(null);
          }
        },
      },
    ]);
  };

  const handleReject = (id) => {
    Alert.alert('Reddet', 'Bu sözleşmeyi reddetmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Reddet',
        style: 'destructive',
        onPress: async () => {
          setActionLoadingId(id);
          try {
            await contractService.reject(id);
            setApprovals((prev) => prev.filter((a) => a.id !== id));
          } catch (error) {
            Alert.alert('Hata', error.message || 'Reddetme başarısız.');
          } finally {
            setActionLoadingId(null);
          }
        },
      },
    ]);
  };

  const renderApproval = ({ item }) => {
    const isActionLoading = actionLoadingId === item.id;

    return (
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.cardType}>{typeLabels[item.type] || item.type}</Text>
          </View>
          <Badge status={item.status} />
        </View>

        <View style={styles.cardMeta}>
          <Text style={styles.metaText}>
            <Ionicons name="person-outline" size={12} color={colors.textMuted} />
            {' '}{item.ownerUsername || 'Bilinmiyor'}
          </Text>
          <Text style={styles.metaText}>
            <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
            {' '}{formatDate(item.createdAt)}
          </Text>
        </View>

        <View style={styles.cardActions}>
          <Button
            title="Onayla"
            variant="success"
            size="sm"
            onPress={() => handleApprove(item.id)}
            loading={isActionLoading}
            disabled={isActionLoading}
            icon={<Ionicons name="checkmark" size={16} color={colors.textInverse} />}
            style={styles.actionButton}
          />
          <Button
            title="Reddet"
            variant="danger"
            size="sm"
            onPress={() => handleReject(item.id)}
            loading={isActionLoading}
            disabled={isActionLoading}
            icon={<Ionicons name="close" size={16} color={colors.textInverse} />}
            style={styles.actionButton}
          />
        </View>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerPadding}>
        <Header
          title="Onaylar"
          subtitle={`${approvals.length} onay bekliyor`}
        />
      </View>

      <FlatList
        data={approvals}
        renderItem={renderApproval}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-done-circle-outline" size={56} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Onay Bekleyen Yok</Text>
            <Text style={styles.emptyText}>Tüm sözleşmeler işlendi</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  headerPadding: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardInfo: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.text,
  },
  cardType: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  metaText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontFamily: fonts.headingMedium,
    fontSize: 18,
    color: colors.text,
    marginTop: 16,
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
