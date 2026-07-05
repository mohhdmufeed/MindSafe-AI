import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
import pickle
import os

print("Reading mergedData.csv...")
df = pd.read_csv('Dataset/mergedData.csv')
df['text'] = df['text'].fillna('')

print("Fitting TF-IDF Vectorizer...")
tf = TfidfVectorizer(ngram_range=(1,2))
tf_vec = tf.fit_transform(df['text'])

print("Training Random Forest Classifier...")
model = RandomForestClassifier(n_estimators=100, max_depth=80, random_state=42)
model.fit(tf_vec, df['label'])

print("Saving models...")
os.makedirs('Flask/Models', exist_ok=True)
with open('Flask/Models/tfidf_tokenizer.pkl', 'wb') as f:
    pickle.dump(tf, f)
with open('Flask/Models/random_forest.pkl', 'wb') as f:
    pickle.dump(model, f)
print("Training completed and models saved successfully!")
