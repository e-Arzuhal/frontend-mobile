import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fonts, radius } from '../styles/tokens';
import Header from '../components/Header';
import ScreenWrapper from '../components/ScreenWrapper';
import notificationService from '../services/notification.service';

const TYPE_ICONS = {
  CONTRACT_PENDING_APPROVAL: 'document-text-outline',
  CONTRACT_APPROVED: 'checkmark-circle-outline',
  CONTRACT_REJECTED: 'close-circle-outline',
};

const formatRelative = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'şimdi';
  if (diffMin < 60) return `${diffMin} dakika önce`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} saat önce`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} gün önce`;
  return d.toLocaleDateString('tr-TR');
};

export default function NotificationsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const data = await notificationService.list(false);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || 'Bildirimler yüklenemedi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // sessizce yut — kullanıcı tekrar deneyebilir
    }
  };

  const handlePress = async (item) => {
    if (!item.read) {
      try {
        await notificationService.markAsRead(item.id);
        setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      } catch {
        // okundu işareti hatası kullanıcıyı engellemesin
      }
    }
    if (item.contractId && navigation) {
      navigation.navigate('Contracts', {
        screen: 'ContractDetail',
        params: { contractId: item.contractId },
      });
    }
  };

  const renderItem = ({ item }) => {
    const iconName = TYPE_ICONS[item.type] || 'notifications-outline';
    return (
      <TouchableOpacity
        style={[styles.item, !item.read && styles.itemUnread]}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconWrap, !item.read && styles.iconWrapUnread]}>
          <Ionicons
            name={iconName}
            size={20}
            color={!item.read ? colors.accent : colors.textMuted}
          />
        </View>
        <View style={styles.itemContent}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {item.title || 'Bildirim'}
            </Text>
            {!item.read && <View style={styles.unreadDot} />}
          </View>
          {!!item.message && (
            <Text style={styles.itemMessage} numberOfLines={2}>
              {item.message}
            </Text>
          )}
          <Text style={styles.itemTime}>{formatRelative(item.createdAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenWrapper>
      {/* Diğer sekmelerle aynı yatay padding (20px) — Header doğrudan
          ScreenWrapper altına yerleştirildiğinde ekran kenarına yapışıyor
          ve dengesiz görünüyordu. */}
      <View style={styles.headerWrap}>
        <Header title="Bildirimler" subtitle="Sözleşme onayları ve güncellemeler" />
      </View>
      <View style={styles.actionsBar}>
        <Text style={styles.countText}>
          {items.filter((n) => !n.read).length} okunmamış
        </Text>
        <TouchableOpacity onPress={handleMarkAllRead} disabled={items.length === 0}>
          <Text style={[styles.markAllText, items.length === 0 && { color: colors.textMuted }]}>
            Tümünü Okundu İşaretle
          </Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-off-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Bildirim yok</Text>
          <Text style={styles.emptyDesc}>
            Sözleşme onay talepleri ve cevapları burada görünecek.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />
          }
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  actionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  countText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  markAllText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.accent,
  },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  itemUnread: {
    backgroundColor: 'rgba(200, 150, 62, 0.04)',
    borderColor: 'rgba(200, 150, 62, 0.25)',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapUnread: {
    backgroundColor: 'rgba(200, 150, 62, 0.12)',
  },
  itemContent: { flex: 1 },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  itemTitle: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  itemMessage: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: 6,
  },
  itemTime: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: fonts.headingMedium,
    fontSize: 17,
    color: colors.text,
    marginTop: 12,
    marginBottom: 4,
  },
  emptyDesc: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
    marginTop: 12,
  },
});
