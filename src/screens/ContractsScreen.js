import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadows } from '../styles/tokens';
import Header from '../components/Header';
import Badge from '../components/Badge';
import Input from '../components/Input';
import ScreenWrapper from '../components/ScreenWrapper';
import contractService from '../services/contract.service';

const typeLabels = {
  SALES: 'Satış',
  RENTAL: 'Kira',
  SERVICE: 'Hizmet',
  EMPLOYMENT: 'İş',
  NDA: 'Gizlilik',
  OTHER: 'Diğer',
};

const filters = [
  { key: 'ALL', label: 'Tümü' },
  { key: 'DRAFT', label: 'Taslak' },
  { key: 'PENDING_APPROVAL', label: 'Beklemede' },
  { key: 'APPROVED', label: 'Onaylı' },
  { key: 'REJECTED', label: 'Reddedildi' },
];

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function ContractsScreen({ navigation }) {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const loadContracts = async () => {
    try {
      const data = await contractService.getAll();
      setContracts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Sözleşmeler yükleme hatası:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadContracts();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadContracts();
  };

  const filtered = contracts.filter((c) => {
    if (activeFilter !== 'ALL' && c.status !== activeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        c.title?.toLowerCase().includes(q) ||
        c.counterpartyName?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const renderContract = ({ item }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('ContractDetail', { contractId: item.id })}
      style={[styles.card, shadows.sm]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.cardType}>{typeLabels[item.type] || item.type}</Text>
        </View>
        <Badge status={item.status} />
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardDate}>
          <Ionicons name="calendar-outline" size={12} color={colors.textMuted} /> {formatDate(item.createdAt)}
        </Text>
        {item.counterpartyName && (
          <Text style={styles.cardParty} numberOfLines={1}>
            <Ionicons name="person-outline" size={12} color={colors.textMuted} /> {item.counterpartyName}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.headerPadding}>
        <Header
          title="Sözleşmelerim"
          subtitle={`${contracts.length} sözleşme`}
        />

        <Input
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Sözleşme ara..."
          icon={<Ionicons name="search-outline" size={20} color={colors.textMuted} />}
          style={styles.searchInput}
        />

        <FlatList
          data={filters}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setActiveFilter(item.key)}
              style={[
                styles.filterChip,
                activeFilter === item.key && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  activeFilter === item.key && styles.filterTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <FlatList
        data={filtered}
        renderItem={renderContract}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>Sözleşme bulunamadı</Text>
          </View>
        }
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  headerPadding: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  searchInput: {
    marginBottom: 8,
  },
  filterList: {
    paddingBottom: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.textInverse,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 12,
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
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cardDate: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  cardParty: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    maxWidth: '50%',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 12,
  },
});
