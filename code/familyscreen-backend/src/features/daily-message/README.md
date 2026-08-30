# Tagesinhalte: Prüfen, freigeben und löschen

Die Tagesinhalte liegen in der Tabelle `daily_messages` der vorhandenen
Anwendungsdatenbank. Schema, Seeds und UI bleiben trotzdem im Feature-Ordner
gekapselt. Persönliche Nachrichten und Benutzer werden nicht verändert.

## Einmalige Einrichtung

Im Backend-Verzeichnis ausführen:

```powershell
npm run db:migrate
npm run db:seed-content
```

Der Seed importiert 260 Kandidaten. Neue Einträge haben immer den Status
`pending` und können daher noch nicht am Gerät erscheinen. Der Seed ist
idempotent: Er kann erneut ausgeführt werden und überspringt vorhandene Texte.

## Sprüche manuell prüfen

1. Backend starten und im Web-Interface anmelden.
2. In der Seitenleiste **Tagesinhalte prüfen** öffnen.
3. Der Filter **Offen** zeigt alle noch ungeprüften Einträge.
4. Pro Karte Text, Kategorie, Zeichenanzahl und verlinkte Inspirationsquelle
   kontrollieren. Das technische Maximum sind 110 Zeichen.
5. **Freigeben** wählen, wenn der Inhalt sprachlich, sachlich und für die
   Familie passend ist. Erst dann nimmt die tägliche Auswahl ihn auf.
6. **Ablehnen** wählen, wenn er unpassend, unklar oder doppeldeutig ist. Er
   bleibt zur Nachvollziehbarkeit gespeichert, wird aber nie angezeigt.
7. Mit den Filtern **Freigegeben**, **Abgelehnt** und **Alle** kann das Ergebnis
   jederzeit erneut kontrolliert und auch korrigiert werden.

Wird der gerade für heute ausgewählte Inhalt abgelehnt, wird seine Anzeige
sofort zurückgesetzt. Beim nächsten Home-Screen-Abruf wählt das Backend einen
anderen freigegebenen Eintrag.

## Sprüche endgültig löschen

Löschen ist bewusst zweistufig, damit ein Fehlklick keinen guten Inhalt
vernichtet:

1. Den betreffenden Eintrag zuerst **Ablehnen**.
2. Den Filter **Abgelehnt** öffnen.
3. Beim Eintrag **Löschen** wählen.
4. Die Sicherheitsabfrage bestätigen.

Der Server akzeptiert eine Löschung ausschließlich für bereits abgelehnte
Einträge. Das Löschen ist endgültig. Soll ein Inhalt nur vorübergehend nicht
angezeigt werden, genügt **Ablehnen**.

`npm run db:seed-content` ist primär für die einmalige Erstbefüllung gedacht.
Wird der Seed später erneut ausgeführt, wird ein zuvor hart gelöschter
Seed-Text wieder als offener Entwurf importiert. Soll er auch bei künftigen
Neuinstallationen verschwinden, zusätzlich den entsprechenden Eintrag aus
`seed-data.ts` entfernen.

## Tägliche Auswahl

Der erste Backend-Abruf eines Wiener Kalendertags markiert genau einen
freigegebenen Eintrag mit diesem Datum. Weitere Geräteabrufe zeigen denselben
Text. Noch nie gezeigte Einträge kommen zuerst, danach die am längsten nicht
verwendeten. Eine eindeutige Datenbankbedingung verhindert zwei verschiedene
Tagesinhalte am selben Tag.

Ist die Tabelle nicht erreichbar oder noch nichts freigegeben, erscheint nur
ein neutraler Statushinweis. Ungeprüfte Inhalte werden niemals als Ersatz
angezeigt.

## Recherchegrundlage

Die kurzen Texte wurden eigenständig formuliert und von diesen Ressourcen
inspiriert; sie bilden keinen kopierten Internetkorpus:

- Oberösterreich Tourismus, *Oberösterreichs Mundart*:
  https://medienservice.oberoesterreich.at/oberoesterreich-woerterbuch.html
- Österreichischer Bundesverlag, *Österreich von A bis Z*:
  https://www.oebv.at/oewb-70-jahre
- Österreichische Akademie der Wissenschaften, *Wörterbuch der bairischen
  Mundarten in Österreich*:
  https://www.oeaw.ac.at/de/acdh/forschung/sprachwissenschaft/ressourcen/woerterbuecher/wboe-online-woerterbuch
- ÖIF Sprachportal, *Österreichisches Deutsch*:
  https://sprachportal.at/fileadmin/user_upload/meinsprachportal-at/OEsterreich_Spiegel/Ausgabe_98/Schwerpunkt_Spiegel_98.pdf
