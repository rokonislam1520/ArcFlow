import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { colors, styles as s } from '../theme';

const suggestions = ['What is my portfolio worth?', 'Best yield options?', 'How to reduce fees?', 'Analyze my spending'];

export default function AIScreen() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const API_URL = 'YOUR_API_URL_HERE'; // Replace with your deployed backend URL

  const handleSend = async (text?: string) => {
    const msg = text || input;
    if (!msg.trim() || loading) return;

    const userMsg = { role: 'user', text: msg };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.text })),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', text: data.reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', text: 'Failed to reach AI. Check your API configuration.' }]);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1 }}>
        {/* Messages */}
        <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: 20 }}>
          {messages.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>🤖</Text>
              <Text style={{ color: colors.textMuted, textAlign: 'center', marginBottom: 8 }}>Ask me anything about your finances</Text>
              <Text style={{ color: colors.textDim, fontSize: 12, textAlign: 'center' }}>Powered by LLM on ARC</Text>
            </View>
          )}
          {messages.map((msg, i) => (
            <View key={i} style={{ marginBottom: 12, alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <View style={{
                maxWidth: '80%', padding: 14, borderRadius: 16,
                backgroundColor: msg.role === 'user' ? 'rgba(20,184,166,0.2)' : 'rgba(255,255,255,0.05)',
                borderWidth: 1,
                borderColor: msg.role === 'user' ? 'rgba(20,184,166,0.3)' : 'rgba(255,255,255,0.1)',
              }}>
                {msg.role === 'assistant' && <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600', marginBottom: 4 }}>ArcFlow AI</Text>}
                <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{msg.text}</Text>
              </View>
            </View>
          ))}
          {loading && (
            <View style={{ alignItems: 'flex-start', marginBottom: 12 }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                <Text style={{ color: colors.textMuted }}>Thinking...</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Suggestions */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, paddingHorizontal: 16, marginBottom: 8 }}>
          {suggestions.map((s) => (
            <TouchableOpacity key={s} onPress={() => handleSend(s)}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', marginRight: 8 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Input */}
        <View style={{ flexDirection: 'row', padding: 16, paddingTop: 8, gap: 8 }}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="Ask about your finances..."
            placeholderTextColor={colors.textDim}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => handleSend()}
          />
          <TouchableOpacity style={[s.button, { paddingHorizontal: 20 }]} onPress={() => handleSend()} disabled={loading}>
            <Text style={{ color: colors.white, fontSize: 18 }}>{'→'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
