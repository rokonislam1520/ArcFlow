import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, styles as s } from '../theme';

const actions = [
  { icon: '💸', label: 'Send', screen: 'Send' },
  { icon: '🔄', label: 'Swap', screen: 'Swap' },
  { icon: '🌉', label: 'Bridge', screen: 'Swap' },
  { icon: '💳', label: 'Pay', screen: 'Send' },
];

export default function HomeScreen({ navigation }: any) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Header */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: colors.textDim, fontSize: 14 }}>Welcome back</Text>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 4 }}>ArcFlow</Text>
        </View>

        {/* Balance Card */}
        <View style={[s.card, { marginBottom: 20 }]}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Total Balance</Text>
          <Text style={{ color: colors.text, fontSize: 36, fontWeight: '800', marginTop: 4 }}>
            Connect Wallet
          </Text>
          <Text style={{ color: colors.textDim, fontSize: 13, marginTop: 4 }}>
            Tap to connect MetaMask
          </Text>

          {/* Quick Actions */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 }}>
            {actions.map((a) => (
              <TouchableOpacity key={a.label} style={local.actionBtn} onPress={() => navigation.navigate(a.screen)}>
                <Text style={{ fontSize: 24 }}>{a.icon}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Recent */}
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Recent Activity</Text>
        {[
          { type: 'Sent', desc: '0x1a2b...3c4d', amt: '250 USDC', time: '2m ago' },
          { type: 'Received', desc: '0x5e6f...7g8h', amt: '1,000 USDC', time: '1h ago' },
          { type: 'Swap', desc: 'USDC → EURC', amt: '500 USDC', time: '3h ago' },
        ].map((tx, i) => (
          <View key={i} style={[s.card, { marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
            <View>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{tx.type}</Text>
              <Text style={{ color: colors.textDim, fontSize: 12 }}>{tx.desc}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{tx.amt}</Text>
              <Text style={{ color: colors.textDim, fontSize: 12 }}>{tx.time}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const local = StyleSheet.create({
  actionBtn: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    minWidth: 64,
  },
});
