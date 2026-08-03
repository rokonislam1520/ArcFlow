import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { colors, styles as s } from '../theme';

const assets = [
  { symbol: 'USDC', chain: 'Ethereum', balance: '8,425.50', value: '$8,425.50' },
  { symbol: 'EURC', chain: 'ARC', balance: '1,200.00', value: '$1,308.00' },
  { symbol: 'USDC', chain: 'Polygon', balance: '2,100.00', value: '$2,100.00' },
  { symbol: 'USDT', chain: 'Arbitrum', balance: '500.00', value: '$500.00' },
  { symbol: 'DAI', chain: 'Base', balance: '320.00', value: '$320.00' },
];

const chainData = [
  { name: 'Ethereum', pct: 67, color: '#3b82f6' },
  { name: 'ARC', pct: 10, color: colors.primary },
  { name: 'Polygon', pct: 17, color: '#a855f7' },
  { name: 'Arbitrum', pct: 4, color: '#06b6d4' },
  { name: 'Base', pct: 2, color: '#60a5fa' },
];

export default function PortfolioScreen() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20 }}>
      {/* Stats */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
        {[
          { label: 'Total Value', value: '$12,653.50' },
          { label: 'Tokens', value: '5' },
          { label: 'Chains', value: '5' },
        ].map((s) => (
          <View key={s.label} style={[local.card, { flex: 1 }]}>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{s.label}</Text>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 4 }}>{s.value}</Text>
          </View>
        ))}
      </View>

      {/* Assets */}
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Assets</Text>
      {assets.map((a, i) => (
        <View key={i} style={[local.card, { marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.white, fontWeight: '700', fontSize: 12 }}>{a.symbol.slice(0, 2)}</Text>
            </View>
            <View>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{a.symbol}</Text>
              <Text style={{ color: colors.textDim, fontSize: 12 }}>{a.chain}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{a.balance}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{a.value}</Text>
          </View>
        </View>
      ))}

      {/* Chain Distribution */}
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 20, marginBottom: 12 }}>Chains</Text>
      <View style={[local.card]}>
        {chainData.map((c) => (
          <View key={c.name} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{c.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{c.pct}%</Text>
            </View>
            <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
              <View style={{ height: 6, width: `${c.pct}%`, backgroundColor: c.color, borderRadius: 3 }} />
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

import { StyleSheet } from 'react-native';
const local = StyleSheet.create({
  card: { ...s.card, padding: 16 },
});
