import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadows } from '../styles/tokens';
import Header from '../components/Header';
import Card from '../components/Card';
import Badge from '../components/Badge';
import ScreenWrapper from '../components/ScreenWrapper';
import contractService from '../services/contract.service';

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const typeLabels = {
  SALES: 'Satış',
  RENTAL: 'Kira',
  SERVICE: 'Hizmet',
  EMPLOYMENT: 'İş',
  NDA: 'Gizlilik',
  OTHER: 'Diğer',
};

export default function DashboardScreen({ navigation }) {
  const [stats, setStats] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [statsData, contractsData] = await Promise.all([
        contractService.getStats(),
        contractService.getAll(),
      ]);
      setStats(statsData);
      setContracts(Array.isArray(contractsData) ? contractsData.slice(0, 5) : []);
    } catch (error) {
      console.error('Dashboard veri yükleme hatası:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const statCards = [
    { label: 'Toplam', value: stats?.totalCount || 0, icon: 'documents', color: colors.primary },
    { label: 'Taslak', value: stats?.draftCount || 0, icon: 'create', color: colors.textSecondary },
    { label: 'Beklemede', value: stats?.pendingCount || 0, icon: 'time', color: colors.warning },
    { label: 'Onaylı', value: stats?.approvedCount || 0, icon: 'checkmark-circle', color: colors.success },
  ];

  return (
    <ScreenWrapper>
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} />}
    >
      <Header
        title="Dashboard"
        subtitle="Sözleşme yönetim paneliniz"
      />

      <View style={styles.statsGrid}>
        {statCards.map((stat, index) => (
          <View key={index} style={styles.statCardWrapper}>
            <Card style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: stat.color + '15' }]}>
                <Ionicons name={stat.icon} size={22} color={stat.color} />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </Card>
          </View>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Son Sözleşmeler</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Contracts')}>
          <Text style={styles.seeAll}>Tümünü Gör</Text>
        </TouchableOpacity>
      </View>

      {contracts.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>Henüz sözleşme bulunmuyor</Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => navigation.navigate('CreateContract')}
          >
            <Text style={styles.emptyButtonText}>İlk Sözleşmeyi Oluştur</Text>
          </TouchableOpacity>
        </Card>
      ) : (
        contracts.map((contract) => (
          <TouchableOpacity
            key={contract.id}
            onPress={() => navigation.navigate('ContractDetail', { contractId: contract.id })}
          >
            <Card style={styles.contractCard}>
              <View style={styles.contractRow}>
                <View style={styles.contractInfo}>
                  <Text style={styles.contractTitle} numberOfLines={1}>
                    {contract.title}
                  </Text>
                  <Text style={styles.contractType}>
                    {typeLabels[contract.type] || contract.type}
                  </Text>
                </View>
                <Badge status={contract.status} />
              </View>
              <View style={styles.contractFooter}>
                <Text style={styles.contractDate}>
                  <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                  {' '}{formatDate(contract.createdAt)}
                </Text>
                {contract.counterpartyName && (
                  <Text style={styles.contractParty} numberOfLines={1}>
                    <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                    {' '}{contract.counterpartyName}
                  </Text>
                )}
              </View>
            </Card>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    marginBottom: 24,
  },
  statCardWrapper: {
    width: '50%',
    padding: 6,
  },
  statCard: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statValue: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: colors.text,
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: fonts.headingMedium,
    fontSize: 18,
    color: colors.text,
  },
  seeAll: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.accent,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 12,
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: colors.accentMuted,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  emptyButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.accent,
  },
  contractCard: {
    marginBottom: 12,
  },
  contractRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  contractInfo: {
    flex: 1,
    marginRight: 12,
  },
  contractTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.text,
  },
  contractType: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  contractFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  contractDate: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  contractParty: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    maxWidth: '50%',
  },
});
