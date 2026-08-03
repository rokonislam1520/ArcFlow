import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { colors, styles as s } from '../theme';

const tokens = ['USDC', 'EURC', 'USDT', 'DAI'];

export default function SwapScreen() {
  const [from, setFrom] = useState('USDC');
  const [to, setTo] = useState('EURC');
  const [fromAmt, setFromAmt] = useState('');

  const flip = () => { const t = from; setFrom(to); setTo(t); };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20 }}>
      {/* Slippage */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
        <Text style={{ color: colors.textMuted }}>Slippage</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[0.1, 0.5, 1.0].map((v) => (
            <TouchableOpacity key={v} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{v}%</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* From */}
      <View style={[s.card, { marginBottom: 4 }]}>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 8 }}>You Pay</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TextInput style={{ color: colors.text, fontSize: 32, fontWeight: '700', flex: 1 }}
            placeholder="0.0" placeholderTextColor={colors.textDim}
            value={fromAmt} onChangeText={setFromAmt} keyboardType="numeric" />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {tokens.map((t) => (
              <TouchableOpacity key={t} onPress={() => setFrom(t)}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: from === t ? colors.primary : 'rgba(255,255,255,0.08)' }}>
                <Text style={{ color: from === t ? colors.white : colors.textMuted, fontSize: 12, fontWeight: '600' }}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Flip */}
      <View style={{ alignItems: 'center', marginVertical: -12, zIndex: 10 }}>
        <TouchableOpacity onPress={flip} style={{ backgroundColor: colors.card, padding: 10, borderRadius: 12, borderWidth: 3, borderColor: colors.bg }}>
          <Text style={{ fontSize: 18 }}>↕</Text>
        </TouchableOpacity>
      </View>

      {/* To */}
      <View style={[s.card, { marginTop: 4, marginBottom: 20 }]}>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 8 }}>You Receive</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.text, fontSize: 32, fontWeight: '700', flex: 1 }}>
            {fromAmt ? (parseFloat(fromAmt) * 1.09).toFixed(2) : '0.0'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {tokens.map((t) => (
              <TouchableOpacity key={t} onPress={() => setTo(t)}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: to === t ? colors.primary : 'rgba(255,255,255,0.08)' }}>
                <Text style={{ color: to === t ? colors.white : colors.textMuted, fontSize: 12, fontWeight: '600' }}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Info */}
      <View style={[s.card, { marginBottom: 20 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ color: colors.textMuted }}>Price Impact</Text>
          <Text style={{ color: colors.accent }}>{'<'}0.01%</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.textMuted }}>Network Fee</Text>
          <Text style={{ color: colors.accent }}>$0.00</Text>
        </View>
      </View>

      <TouchableOpacity style={s.button} onPress={() => Alert.alert('Swap', 'Swap submitted!')}>
        <Text style={s.buttonText}>{fromAmt ? `Swap ${from} → ${to}` : 'Enter Amount'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
