#!/bin/bash
KEY="AIzaSyCuwVQ99uAVfTwMNqn95jQRfU25YpZRTyM"
curl -s \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"say hi"}]}]}' \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$KEY" \
  | head -c 400
echo
