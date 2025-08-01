#!/bin/bash

echo "=== Linux Audio Debugging Script ==="
echo ""

echo "1. Checking PulseAudio status:"
pulseaudio --check && echo "✓ PulseAudio is running" || echo "✗ PulseAudio is NOT running"
echo ""

echo "2. Listing audio input devices:"
pactl list sources short
echo ""

echo "3. Checking default input device:"
pactl info | grep "Default Source"
echo ""

echo "4. Testing microphone (speak now for 3 seconds):"
echo "Recording..."
arecord -d 3 -f cd /tmp/test-audio.wav 2>&1
echo "Playing back..."
aplay /tmp/test-audio.wav 2>&1
rm -f /tmp/test-audio.wav
echo ""

echo "5. Browser audio permissions (Chrome/Chromium):"
if [ -d "$HOME/.config/chromium" ]; then
    echo "Chromium config found"
elif [ -d "$HOME/.config/google-chrome" ]; then
    echo "Chrome config found"
else
    echo "No Chrome/Chromium config found"
fi
echo ""

echo "6. Checking if microphone is muted in PulseAudio:"
pactl list sources | grep -A 10 "Name.*input" | grep "Mute:"
echo ""

echo "=== Recommendations ==="
echo "If microphone test failed:"
echo "1. Run: pulseaudio --start"
echo "2. Run: pavucontrol (to adjust audio settings)"
echo "3. Check browser permissions: chrome://settings/content/microphone"
echo "4. Grant microphone permissions when prompted"
