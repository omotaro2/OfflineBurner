# フィールドシェルフ

出先のオフライン環境で、保管済みの安定版ファームをブラウザから書き込むためのローカルツールです。家でネットがあるときに安定版をディスクへ保存し、Q508 のような Debian タブレットではそのファイルだけを使います。

棚にあるのは、フィールドで使う次の3つです。

- Cardputer Adv 向け Meshtastic ADV（merged イメージ）
- Cardputer Adv 向け Ratspeak full（Standalone と RNode）
- Heltec WiFi LoRa 32 V3 向け Meshtastic 公式の安定版

プレリリースは取りません。攻撃用のファームウェアは置いていません。

## 使い方

家のネットに繋がっている状態で入れます。

```bash
npm install
npm run dev
```

Chromium で http://127.0.0.1:43127 を開きます。

1. 「安定版をまとめて保管」を押す。ファイルは `data/cache/` に残ります。
2. 出先では同じコマンドでこのアプリを起動する。ネットが無くても、保管済みのカードから「オフラインで書き込む」が使えます。
3. 家に戻ったら、もう一度「安定版をまとめて保管」か、各カードの「安定版に更新」を押す。公開中の安定版と保管済みの版が違うときだけ、更新ボタンに変わります。

書き込みは Web Serial を使うので、Chrome か Edge で開きます。Firefox では保管はできて、書き込みはできません。

## Q508 / Debian

ユーザーを `dialout` に入れて、一度ログアウトします。

```bash
sudo apt install python3-venv
sudo usermod -aG dialout $USER
```

このアプリ自体に Python は不要です。ポートの権限だけ足します。書き込み中は、このページ以外のブラウザタブとシリアルモニタを閉じます。

Cardputer Adv は、側面スイッチを OFF にし、G0 を押したまま USB を挿してから離します。Heltec V3 が応答しないときは、PRG を押したまま RST を一度押します。どちらの書き込みもフラッシュを全消去するので、端末内の設定と履歴は消えます。

LoRa キャップや Heltec は、起動して送信する前にアンテナを付けます。Cap LoRa-1262 の技適は 922.0〜923.4 MHz、空中線電力 1.5〜5.0 mW です。

## 開発

```bash
npm test
npm run build
npm start
```
