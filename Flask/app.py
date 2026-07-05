from flask import Flask, jsonify, render_template, request
import json
import preprocess_text
import tensorflow as tf
from tf_keras.preprocessing.sequence import pad_sequences
from tf_keras.models import load_model
import pickle
import numpy as np
from datetime import datetime

app = Flask(__name__)

# ─────────────────────────────────────────────
# Load models ONCE at startup (not per request)
# ─────────────────────────────────────────────
print("[MindSafe AI] Loading models...")
tf_idf      = pickle.load(open('./Models/tfidf_tokenizer.pkl', 'rb'))
rf_model    = pickle.load(open('./Models/random_forest.pkl', 'rb'))
tokenizer   = pickle.load(open('./Models/tf_tokenizer.pkl', 'rb'))
lstm_model  = load_model('./Models/lstm.h5', compile=False)
print("[MindSafe AI] All models loaded successfully!")

# ─────────────────────────────────────────────
# In-memory analytics store (resets on restart)
# ─────────────────────────────────────────────
analysis_history = []

# ─────────────────────────────────────────────
# Emotion detection lexicon
# ─────────────────────────────────────────────
EMOTION_LEXICONS = {
    'hopelessness': ['hopeless', 'no hope', 'pointless', 'worthless', 'useless',
                     'give up', 'nothing left', 'no reason', 'meaningless', 'futile', 'no future'],
    'despair':      ['despair', 'desperate', 'unbearable', "can't go on", 'cannot go on',
                     'too much pain', 'suffering', 'agony', 'torment', 'miserable'],
    'loneliness':   ['alone', 'lonely', 'no one', 'nobody', 'isolated', 'abandoned',
                     'unloved', 'unwanted', 'invisible', 'forgotten', 'no friends'],
    'anger':        ['hate', 'angry', 'rage', 'furious', 'hatred', 'bitter',
                     'resentment', 'frustrated', 'disgust', 'outrage'],
    'guilt':        ['guilty', 'shame', 'worthless', 'burden', 'fault',
                     'blame myself', 'regret', 'let everyone down'],
    'fear':         ['scared', 'terrified', 'afraid', 'fear', 'anxious',
                     'panic', 'dread', 'horror', 'overwhelmed'],
}


def detect_emotions(text):
    """Detect emotions present in text using keyword lexicon."""
    text_lower = text.lower()
    detected = []
    for emotion, keywords in EMOTION_LEXICONS.items():
        if any(kw in text_lower for kw in keywords):
            detected.append(emotion)
    return detected


def get_risk_words(cleaned_text):
    """Extract top risk-indicating words using TF-IDF + RF feature importance."""
    try:
        vec = tf_idf.transform([cleaned_text])
        feature_names = tf_idf.get_feature_names_out()
        importances = rf_model.feature_importances_
        non_zero_idx = vec.nonzero()[1]
        word_scores = []
        for idx in non_zero_idx:
            score = importances[idx] * vec[0, idx]
            word_scores.append((feature_names[idx], float(score)))
        word_scores.sort(key=lambda x: x[1], reverse=True)
        return [w for w, _ in word_scores[:6]]
    except Exception:
        return []


def compute_severity(rf_proba, lstm_proba):
    """Compute blended severity score (0–100) and risk level label."""
    score = round((rf_proba + lstm_proba) / 2.0 * 100, 1)
    if score >= 80:
        level = "Critical"
    elif score >= 60:
        level = "High"
    elif score >= 35:
        level = "Moderate"
    else:
        level = "Safe"
    return score, level


def _do_predict(text):
    """Core prediction logic shared by /predict and /api/predict."""
    try:
        if not text or not text.strip():
            return jsonify({"status": 422, "message": "No text provided"})

        cleaned = preprocess_text.clean_text(text)

        # — Random Forest —
        vec      = tf_idf.transform([cleaned])
        ml_pred  = int(rf_model.predict(vec)[0])
        ml_proba = float(rf_model.predict_proba(vec)[0][1])   # P(suicidal)

        # — Bidirectional LSTM —
        sequence = tokenizer.texts_to_sequences([cleaned])
        padded   = pad_sequences(sequence, padding='post')
        dl_raw   = float(lstm_model.predict(padded, verbose=0)[0][0])
        dl_pred  = int(dl_raw > 0.5)

        # — Derived metrics —
        severity_score, risk_level = compute_severity(ml_proba, dl_raw)
        emotions   = detect_emotions(text)
        risk_words = get_risk_words(cleaned)

        result = {
            "status":        200,
            "ml_pred":       ml_pred,
            "dl_pred":       dl_pred,
            "ml_confidence": round(ml_proba * 100, 1),
            "dl_confidence": round(dl_raw   * 100, 1),
            "severity_score": severity_score,
            "risk_level":    risk_level,
            "emotions":      emotions,
            "top_risk_words": risk_words,
        }

        # Save to in-memory history (capped at 500)
        analysis_history.append({
            **result,
            "text":      text[:120],
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        })
        if len(analysis_history) > 500:
            analysis_history.pop(0)

        return jsonify(result)

    except Exception as e:
        print(f"[ERROR] Prediction error: {e}")
        return jsonify({"status": 422, "message": "Internal Server Error"})


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@app.route('/', methods=['GET'])
def home():
    return render_template('index.html')


@app.route('/dashboard', methods=['GET'])
def dashboard():
    return render_template('dashboard.html')


@app.route('/predict', methods=['POST'])
def predict():
    """Form-based prediction (used by the chat UI)."""
    text = request.form.get('text', '')
    return _do_predict(text)


@app.route('/api/predict', methods=['POST'])
def api_predict():
    """JSON REST endpoint for external integrations."""
    data = request.get_json(silent=True) or {}
    text = data.get('text', request.form.get('text', ''))
    return _do_predict(text)


@app.route('/api/stats', methods=['GET'])
def api_stats():
    """Aggregate statistics for the dashboard."""
    total = len(analysis_history)
    risk_counts    = {'Safe': 0, 'Moderate': 0, 'High': 0, 'Critical': 0}
    emotion_counts = {}

    for item in analysis_history:
        rl = item.get('risk_level', 'Safe')
        risk_counts[rl] = risk_counts.get(rl, 0) + 1
        for em in item.get('emotions', []):
            emotion_counts[em] = emotion_counts.get(em, 0) + 1

    high_risk = risk_counts['High'] + risk_counts['Critical']

    return jsonify({
        'total':              total,
        'high_risk_count':    high_risk,
        'safe_count':         risk_counts['Safe'],
        'risk_distribution':  risk_counts,
        'emotion_distribution': emotion_counts,
        'recent':             list(reversed(analysis_history[-10:])),
    })


if __name__ == '__main__':
    app.run(debug=True)
