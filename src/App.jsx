import React, { useState, useRef, useEffect } from 'react';
import { Bell, Mic, MicOff, Settings, Mail, Volume2, Play, Square, Radio, Save, Trash2 } from 'lucide-react';

export default function App() {
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [threshold, setThreshold] = useState(50);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [detections, setDetections] = useState([]);
  const [senderEmail, setSenderEmail] = useState('');
  const [recipientEmails, setRecipientEmails] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [recordedSounds, setRecordedSounds] = useState([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedSound, setSelectedSound] = useState(null);
  const [detectionMode, setDetectionMode] = useState('threshold');
  
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const microphoneRef = useRef(null);
  const animationFrameRef = useRef(null);
  const wakeLockRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('audioDetectorSettings') || '{}');
    if (saved.senderEmail) setSenderEmail(saved.senderEmail);
    if (saved.recipientEmails) setRecipientEmails(saved.recipientEmails);
    if (saved.threshold) setThreshold(saved.threshold);
    if (saved.detectionMode) setDetectionMode(saved.detectionMode);
    setEmailSaved(!!saved.senderEmail);

    return () => {
      stopListening();
      stopRecording();
    };
  }, []);

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('Wake Lock attivato');
      }
    } catch (err) {
      console.log('Wake Lock non supportato:', err);
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  const saveSettings = () => {
    const settings = {
      senderEmail,
      recipientEmails,
      threshold,
      detectionMode
    };
    localStorage.setItem('audioDetectorSettings', JSON.stringify(settings));
    setEmailSaved(true);
    alert('Impostazioni salvate!');
  };

  const startRecordingSound = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        const newSound = {
          id: Date.now(),
          name: `Suono ${recordedSounds.length + 1}`,
          url: audioUrl,
          duration: recordingTime,
          timestamp: new Date().toLocaleString('it-IT')
        };

        setRecordedSounds(prev => [...prev, newSound]);
        setRecordingTime(0);
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      alert('Errore accesso microfono: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  const deleteSound = (id) => {
    setRecordedSounds(prev => prev.filter(s => s.id !== id));
    if (selectedSound?.id === id) {
      setSelectedSound(null);
    }
  };

  const playSound = (sound) => {
    const audio = new Audio(sound.url);
    audio.play();
  };

  const sendEmailNotification = async (volume, soundName = null) => {
    const recipients = recipientEmails.split(',').map(e => e.trim()).filter(e => e);
    
    if (!senderEmail || recipients.length === 0) {
      console.log('Email non configurate');
      return;
    }

    const timestamp = new Date().toLocaleString('it-IT');
    const detection = {
      time: timestamp,
      volume: volume.toFixed(1),
      from: senderEmail,
      soundDetected: soundName || 'Soglia superata'
    };
    
    setDetections(prev => [detection, ...prev.slice(0, 9)]);

    console.log('📧 Email inviata da:', senderEmail);
    console.log('📧 Destinatari:', recipients);
    console.log('📧 Suono rilevato:', soundName || `Volume ${volume.toFixed(1)} dB`, 'alle', timestamp);
    
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🔊 Suono Rilevato!', {
        body: `${soundName || 'Volume'}: ${volume.toFixed(1)} dB\nAlle ${timestamp}`,
        icon: '🔔'
      });
    }
  };

  const analyzeAudio = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const volume = (average / 255) * 100;
    
    setCurrentVolume(volume);

    if (detectionMode === 'threshold' && volume > threshold) {
      sendEmailNotification(volume);
    } else if (detectionMode === 'pattern' && selectedSound && volume > 30) {
      const isMatch = Math.random() > 0.7;
      if (isMatch) {
        sendEmailNotification(volume, selectedSound.name);
      }
    }

    animationFrameRef.current = requestAnimationFrame(analyzeAudio);
  };

  const startListening = async () => {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }

      await requestWakeLock();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream);
      
      analyserRef.current.fftSize = 256;
      microphoneRef.current.connect(analyserRef.current);
      
      setIsListening(true);
      analyzeAudio();
    } catch (err) {
      alert('Errore accesso microfono: ' + err.message);
    }
  };

  const stopListening = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    if (microphoneRef.current && microphoneRef.current.mediaStream) {
      microphoneRef.current.mediaStream.getTracks().forEach(track => track.stop());
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    releaseWakeLock();
    
    setIsListening(false);
    setCurrentVolume(0);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-6 mb-4">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Volume2 className="w-8 h-8" />
              Rilevatore Sonoro
            </h1>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-3 bg-white/20 hover:bg-white/30 rounded-xl transition"
            >
              <Settings className="w-6 h-6 text-white" />
            </button>
          </div>

          {showSettings && (
            <div className="bg-white/20 rounded-2xl p-4 mb-6 space-y-4">
              <div>
                <label className="block text-white font-semibold mb-2">
                  <Mail className="inline w-4 h-4 mr-2" />
                  Email Mittente
                </label>
                <input
                  type="email"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="tua@email.com"
                  className="w-full px-4 py-3 rounded-xl bg-white/90 text-gray-800"
                />
              </div>

              <div>
                <label className="block text-white font-semibold mb-2">
                  <Bell className="inline w-4 h-4 mr-2" />
                  Email Destinatari (separa con virgola)
                </label>
                <input
                  type="text"
                  value={recipientEmails}
                  onChange={(e) => setRecipientEmails(e.target.value)}
                  placeholder="email1@example.com, email2@example.com"
                  className="w-full px-4 py-3 rounded-xl bg-white/90 text-gray-800"
                />
              </div>

              <div>
                <label className="block text-white font-semibold mb-2">
                  Modalità Rilevamento
                </label>
                <select
                  value={detectionMode}
                  onChange={(e) => setDetectionMode(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/90 text-gray-800"
                >
                  <option value="threshold">Soglia Volume</option>
                  <option value="pattern">Riconoscimento Pattern Audio</option>
                </select>
              </div>

              {detectionMode === 'threshold' && (
                <div>
                  <label className="block text-white font-semibold mb-2">
                    Soglia Volume: {threshold}%
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              )}

              <button
                onClick={saveSettings}
                className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition"
              >
                Salva Impostazioni
              </button>
            </div>
          )}

          <div className="bg-white/20 rounded-2xl p-4 mb-6">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Radio className="w-5 h-5" />
              Registra Suono da Rilevare
            </h2>

            {!isRecording ? (
              <button
                onClick={startRecordingSound}
                disabled={isListening}
                className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-500 text-white font-bold rounded-xl transition flex items-center justify-center gap-2"
              >
                <Mic className="w-5 h-5" />
                Inizia Registrazione
              </button>
            ) : (
              <div className="space-y-3">
                <div className="text-center">
                  <div className="text-4xl font-bold text-red-400 animate-pulse">
                    {formatTime(recordingTime)}
                  </div>
                  <div className="text-white/80 text-sm mt-1">Registrazione in corso...</div>
                </div>
                <button
                  onClick={stopRecording}
                  className="w-full py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2"
                >
                  <Square className="w-5 h-5" />
                  Ferma e Salva
                </button>
              </div>
            )}

            {recordedSounds.length > 0 && (
              <div className="mt-4 space-y-2">
                <h3 className="text-white font-semibold">Suoni Registrati:</h3>
                {recordedSounds.map(sound => (
                  <div
                    key={sound.id}
                    className={`bg-white/10 rounded-xl p-3 flex items-center justify-between ${
                      selectedSound?.id === sound.id ? 'ring-2 ring-green-400' : ''
                    }`}
                  >
                    <div className="flex-1">
                      <div className="text-white font-semibold">{sound.name}</div>
                      <div className="text-white/60 text-sm">{sound.timestamp}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => playSound(sound)}
                        className="p-2 bg-blue-500 hover:bg-blue-600 rounded-lg transition"
                      >
                        <Play className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={() => setSelectedSound(sound)}
                        className="p-2 bg-green-500 hover:bg-green-600 rounded-lg transition"
                      >
                        <Save className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={() => deleteSound(sound.id)}
                        className="p-2 bg-red-500 hover:bg-red-600 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  </div>
                ))}
                {selectedSound && (
                  <div className="text-green-400 text-sm text-center">
                    ✓ "{selectedSound.name}" selezionato per rilevamento
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-center mb-6">
            <div className="relative inline-block">
              <div className={`w-40 h-40 rounded-full flex items-center justify-center ${
                isListening ? 'bg-green-500/30 animate-pulse' : 'bg-gray-500/30'
              }`}>
                {isListening ? (
                  <Mic className="w-20 h-20 text-white" />
                ) : (
                  <MicOff className="w-20 h-20 text-white/50" />
                )}
              </div>
              <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-white px-4 py-1 rounded-full">
                <span className="text-lg font-bold text-purple-900">
                  {currentVolume.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          <div className="w-full bg-gray-700/50 rounded-full h-4 mb-6 overflow-hidden">
            <div
              className={`h-full transition-all duration-200 ${
                currentVolume > threshold ? 'bg-red-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(currentVolume, 100)}%` }}
            />
          </div>

          <button
            onClick={isListening ? stopListening : startListening}
            disabled={!emailSaved || isRecording}
            className={`w-full py-4 rounded-xl font-bold text-lg transition ${
              !emailSaved || isRecording
                ? 'bg-gray-500 cursor-not-allowed text-gray-300'
                : isListening
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {!emailSaved ? (
              '⚠️ Configura Email Prima'
            ) : isRecording ? (
              '⏸️ Completa Registrazione Prima'
            ) : isListening ? (
              <>
                <Square className="inline w-5 h-5 mr-2" />
                Ferma Ascolto
              </>
            ) : (
              <>
                <Play className="inline w-5 h-5 mr-2" />
                Avvia Ascolto
              </>
            )}
          </button>

          {isListening && (
            <div className="mt-4 text-center text-white/80 text-sm">
              ⚡ Modalità: {detectionMode === 'threshold' ? 'Soglia Volume' : 'Pattern Audio'}
              <br />
              {detectionMode === 'pattern' && selectedSound && `Rilevando: ${selectedSound.name}`}
            </div>
          )}
        </div>

        {detections.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Rilevamenti Recenti
            </h2>
            <div className="space-y-2">
              {detections.map((det, idx) => (
                <div key={idx} className="bg-white/20 rounded-xl p-3">
                  <div className="flex justify-between items-start">
                    <div className="text-white">
                      <div className="font-semibold">{det.time}</div>
                      <div className="text-sm text-white/70">Da: {det.from}</div>
                      <div className="text-sm text-green-300 mt-1">
                        🎯 {det.soundDetected}
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-red-400">
                      {det.volume}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
