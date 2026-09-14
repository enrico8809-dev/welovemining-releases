import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Header from "../../components/Header";
import Card from "../../components/Card";
import { C, R, S, T } from "../../lib/theme";
import { RootStackParamList } from "../../navigation/routes";

interface ComingSoonScreenProps {
  moduleNumber: number;
  title: string;
  blurb: string;
  planned: string[];
}

export default function ComingSoonScreen({
  moduleNumber,
  title,
  blurb,
  planned,
}: ComingSoonScreenProps) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header
        title={title.toUpperCase()}
        subtitle={`Module ${moduleNumber}`}
        onBack={() => nav.goBack()}
      />

      <View style={styles.body}>
        <Card index={0} accent="orange">
          <View style={styles.pill}>
            <Text style={styles.pillText}>COMING SOON</Text>
          </View>
          <Text style={styles.blurb}>{blurb}</Text>
        </Card>

        <Card index={1} title="WHAT IT WILL DO">
          {planned.map((item, i) => (
            <View key={item} style={styles.item}>
              <Text style={styles.bullet}>{String(i + 1).padStart(2, "0")}</Text>
              <Text style={styles.itemText}>{item}</Text>
            </View>
          ))}
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: S.huge },
  body: { paddingHorizontal: S.lg, gap: S.lg },
  pill: {
    alignSelf: "flex-start",
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.orange,
    borderRadius: R.pill,
    paddingHorizontal: S.md,
    paddingVertical: 4,
    marginBottom: S.md,
  },
  pillText: { ...T.label, fontSize: 10, color: C.orange },
  blurb: { ...T.body, color: C.textDim, lineHeight: 22 },
  item: { flexDirection: "row", gap: S.md, paddingVertical: S.sm },
  bullet: { ...T.caption, color: C.orange, width: 20 },
  itemText: { ...T.small, color: C.textDim, flex: 1, lineHeight: 19 },
});
