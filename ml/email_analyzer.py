import numpy as np
import pandas as pd
import re
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from nltk.sentiment import SentimentIntensityAnalyzer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_similarity
import joblib
import os
import datetime
import logging
import spacy
from scipy.sparse import vstack

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('email_analyzer')

# Download NLTK resources if not already downloaded
try:
    nltk.data.find('tokenizers/punkt')
    nltk.data.find('corpora/stopwords')
    nltk.data.find('sentiment/vader_lexicon')
except LookupError:
    nltk.download('punkt')
    nltk.download('stopwords')
    nltk.download('vader_lexicon')

class EmailAnalyzer:
    def __init__(self, model_path=None):
        self.stop_words = set(stopwords.words('english'))
        self.vectorizer = TfidfVectorizer(max_features=1000)
        self.model = None
        self.email_vectors = None
        self.emails = None
        self.sentiment_analyzer = SentimentIntensityAnalyzer()
        self.learning_history = []
        # Load spaCy model for NER
        try:
            self.nlp = spacy.load('en_core_web_sm')
        except Exception as e:
            self.nlp = None
            logger.warning(f"spaCy model not loaded: {e}")
        # Load model if path is provided and model exists
        if model_path and os.path.exists(model_path):
            self.load_model(model_path)
            logger.info(f"Model loaded from {model_path}")
        else:
            logger.info("No model found, will train on sample data")
    
    def preprocess_text(self, text):
        """Clean and tokenize text"""
        if not isinstance(text, str):
            return ""
            
        # Convert to lowercase and remove special characters
        text = re.sub(r'[^\w\s]', '', text.lower())
        
        # Tokenize and remove stopwords
        tokens = word_tokenize(text)
        filtered_tokens = [w for w in tokens if w not in self.stop_words]
        
        return " ".join(filtered_tokens)
    
    def extract_variables(self, text):
        """Extract potential variables from text using regex"""
        # Look for patterns like {{name}}, {name}, %name%, etc.
        patterns = [
            r'\{\{([\w\s]+)\}\}',  # {{variable}}
            r'\{([\w\s]+)\}',      # {variable}
            r'%([\w\s]+)%',        # %variable%
            r'\$([\w\s]+)',        # $variable
            r'<([\w\s]+)>'         # <variable>
        ]
        
        variables = []
        for pattern in patterns:
            matches = re.findall(pattern, text)
            variables.extend([match.strip() for match in matches])
        
        return list(set(variables))  # Remove duplicates
    
    def analyze_sentiment(self, text):
        """Advanced sentiment analysis using VADER"""
        if not text:
            return "neutral"
            
        # Get sentiment scores
        sentiment_scores = self.sentiment_analyzer.polarity_scores(text)
        
        # Determine sentiment based on compound score
        if sentiment_scores['compound'] >= 0.05:
            return "positive"
        elif sentiment_scores['compound'] <= -0.05:
            return "negative"
        else:
            return "neutral"
    
    def extract_entities(self, text):
        """Extract named entities from text using regex and spaCy NER"""
        # Regex-based extraction
        entities = {
            "dates": re.findall(r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b', text),
            "times": re.findall(r'\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\b', text),
            "emails": re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text),
            "phone_numbers": re.findall(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', text),
            "urls": re.findall(r'https?://[^\s]+', text),
            "names": re.findall(r'(?<!^)(?<!\.\s)\b[A-Z][a-z]+\b', text)
        }
        # spaCy NER extraction
        if self.nlp:
            doc = self.nlp(text)
            spacy_entities = {}
            for ent in doc.ents:
                label = ent.label_.lower()
                if label not in spacy_entities:
                    spacy_entities[label] = []
                spacy_entities[label].append(ent.text)
            # Merge spaCy entities into the main dict
            for label, values in spacy_entities.items():
                if label in entities:
                    entities[label].extend(values)
                else:
                    entities[label] = values
            # Remove duplicates
            for k in entities:
                entities[k] = list(set(entities[k]))
        return entities
    
    def fit(self, emails):
        """Train the model on a list of emails"""
        self.emails = emails
        processed_emails = [self.preprocess_text(email) for email in emails]
        
        # Create TF-IDF vectors
        self.email_vectors = self.vectorizer.fit_transform(processed_emails)
        
        # Cluster emails (if we have enough data)
        if len(emails) >= 5:
            n_clusters = min(5, len(emails))
            self.model = KMeans(n_clusters=n_clusters, random_state=42)
            self.model.fit(self.email_vectors)
            
        # Record learning event
        self.learning_history.append({
            "event": "model_training",
            "timestamp": datetime.datetime.now().isoformat(),
            "num_emails": len(emails)
        })
        
        logger.info(f"Model trained on {len(emails)} emails")
    
    def get_similar_emails(self, email_text, top_n=3):
        """Find similar emails to the given text"""
        if self.email_vectors is None or self.emails is None:
            return []
        
        # Preprocess and vectorize the input email
        processed_email = self.preprocess_text(email_text)
        email_vector = self.vectorizer.transform([processed_email])
        
        # Calculate similarity with all emails
        similarities = cosine_similarity(email_vector, self.email_vectors).flatten()
        
        # Get indices of top similar emails
        similar_indices = similarities.argsort()[-(top_n+1):-1][::-1]
        
        # Return similar emails with similarity scores
        similar_emails = [
            {"email": self.emails[idx], "similarity": float(similarities[idx])}
            for idx in similar_indices
        ]
        
        # Record learning event
        self.learning_history.append({
            "event": "similarity_search",
            "timestamp": datetime.datetime.now().isoformat(),
            "query": email_text[:100] + "...",  # Truncate for privacy
            "num_results": len(similar_emails)
        })
        
        return similar_emails
    
    def suggest_template(self, email_text):
        """Suggest a template based on the email content"""
        # Extract potential variables
        variables = self.extract_variables(email_text)
        
        # If variables already exist, return the email as is
        if variables:
            return {
                "template": email_text,
                "variables": variables,
                "message": "Template already contains variables."
            }
        
        # Extract entities for potential variables
        entities = self.extract_entities(email_text)
        
        # Create a templated version
        templated_text = email_text
        variable_dict = {}
        
        # Process each entity type
        for entity_type, values in entities.items():
            for i, value in enumerate(values):
                if value in templated_text:  # Only replace if still present
                    var_name = f"{entity_type[:-1] if entity_type.endswith('s') else entity_type}{i+1}"
                    templated_text = templated_text.replace(value, f"{{{{{{var_name}}}}}}", 1)
                    variable_dict[var_name] = value
        
        # Record learning event
        self.learning_history.append({
            "event": "template_suggestion",
            "timestamp": datetime.datetime.now().isoformat(),
            "num_variables": len(variable_dict)
        })
        
        return {
            "template": templated_text,
            "variables": variable_dict,
            "message": "Generated template with suggested variables."
        }
    
    def learn_from_task(self, task_data):
        """Learn from task execution data"""
        # Extract relevant information from task data
        email_content = task_data.get("message", "")
        template = task_data.get("template", "")
        variables = task_data.get("variables", {})
        
        # If we have email content, add it to our training data
        if email_content and self.emails is not None:
            self.emails.append(email_content)
            processed_email = self.preprocess_text(email_content)
            
            # Update vectorizer and vectors
            if self.email_vectors is not None:
                new_vector = self.vectorizer.transform([processed_email])
                self.email_vectors = vstack([self.email_vectors, new_vector])
                
                # Retrain model if we have enough data
                if len(self.emails) >= 5 and len(self.emails) % 5 == 0:
                    n_clusters = min(5, len(self.emails))
                    self.model = KMeans(n_clusters=n_clusters, random_state=42)
                    self.model.fit(self.email_vectors)
            
            # Record learning event
            self.learning_history.append({
                "event": "task_learning",
                "timestamp": datetime.datetime.now().isoformat(),
                "task_id": task_data.get("_id", "unknown"),
                "has_template": bool(template)
            })
            
            logger.info(f"Learned from task {task_data.get('_id', 'unknown')}")
            
            return True
        return False
    
    def get_learning_stats(self):
        """Get statistics about the learning process"""
        if not self.learning_history:
            return {
                "total_events": 0,
                "model_trained": False,
                "last_update": None
            }
            
        event_counts = {}
        for event in self.learning_history:
            event_type = event["event"]
            event_counts[event_type] = event_counts.get(event_type, 0) + 1
            
        last_event = self.learning_history[-1]
        
        return {
            "total_events": len(self.learning_history),
            "event_counts": event_counts,
            "model_trained": self.model is not None,
            "last_update": last_event["timestamp"],
            "num_emails": len(self.emails) if self.emails else 0
        }
    
    def save_model(self, path):
        """Save the trained model and vectorizer"""
        if self.model is not None and self.vectorizer is not None:
            model_data = {
                "model": self.model,
                "vectorizer": self.vectorizer,
                "email_vectors": self.email_vectors,
                "emails": self.emails,
                "learning_history": self.learning_history
            }
            joblib.dump(model_data, path)
            logger.info(f"Model saved to {path}")
            return True
        return False
    
    def load_model(self, path):
        """Load a trained model and vectorizer"""
        try:
            model_data = joblib.load(path)
            self.model = model_data["model"]
            self.vectorizer = model_data["vectorizer"]
            self.email_vectors = model_data["email_vectors"]
            self.emails = model_data["emails"]
            self.learning_history = model_data.get("learning_history", [])
            return True
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            return False

# Example usage
if __name__ == "__main__":
    # Sample emails
    sample_emails = [
        "Dear John, Your invoice #12345 is due on 01/15/2023. Please make the payment at your earliest convenience.",
        "Hi Sarah, Just a reminder that our meeting is scheduled for tomorrow at 2:30 PM. Looking forward to seeing you.",
        "Hello Team, The quarterly report is now available. Please review it by Friday and provide your feedback.",
        "Dear Customer, Thank you for your recent purchase. Your order #54321 will be shipped on Monday.",
        "Hi David, I hope this email finds you well. I wanted to follow up on our discussion about the project timeline."
    ]
    
    # Initialize and train the analyzer
    analyzer = EmailAnalyzer()
    analyzer.fit(sample_emails)
    
    # Test with a new email
    new_email = "Hello Alex, Your appointment is confirmed for 03/10/2023 at 10:00 AM. Please arrive 15 minutes early."
    
    # Get similar emails
    similar = analyzer.get_similar_emails(new_email)
    print("Similar emails:")
    for item in similar:
        print(f"Similarity: {item['similarity']:.2f}")
        print(f"Email: {item['email']}")
        print()
    
    # Suggest template
    template_suggestion = analyzer.suggest_template(new_email)
    print("\nTemplate suggestion:")
    print(f"Template: {template_suggestion['template']}")
    print(f"Variables: {template_suggestion['variables']}")
    print(f"Message: {template_suggestion['message']}")
    
    # Get sentiment
    sentiment = analyzer.analyze_sentiment(new_email)
    print(f"\nSentiment: {sentiment}")
    
    # Extract entities
    entities = analyzer.extract_entities(new_email)
    print("\nExtracted entities:")
    for entity_type, values in entities.items():
        if values:
            print(f"{entity_type}: {values}")
    
    # Save the model
    analyzer.save_model("email_analyzer_model.joblib")
    
    # Get learning stats
    stats = analyzer.get_learning_stats()
    print("\nLearning stats:")
    print(f"Total events: {stats['total_events']}")
    print(f"Model trained: {stats['model_trained']}")
    print(f"Last update: {stats['last_update']}")