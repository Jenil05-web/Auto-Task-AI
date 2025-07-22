import sys
import json
import os
import logging
from email_analyzer import EmailAnalyzer

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('email_analyzer_api')

def main():
    # Check if we have enough arguments
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No email content provided"}))
        sys.exit(1)
    
    # Initialize the analyzer
    model_path = os.path.join(os.path.dirname(__file__), "email_analyzer_model.joblib")
    analyzer = EmailAnalyzer(model_path)
    
    # If model doesn't exist or couldn't be loaded, train on sample data
    if analyzer.model is None:
        logger.info("Training model on sample data")
        sample_emails = [
            "Dear John, Your invoice #12345 is due on 01/15/2023. Please make the payment at your earliest convenience.",
            "Hi Sarah, Just a reminder that our meeting is scheduled for tomorrow at 2:30 PM. Looking forward to seeing you.",
            "Hello Team, The quarterly report is now available. Please review it by Friday and provide your feedback.",
            "Dear Customer, Thank you for your recent purchase. Your order #54321 will be shipped on Monday.",
            "Hi David, I hope this email finds you well. I wanted to follow up on our discussion about the project timeline."
        ]
        analyzer.fit(sample_emails)
        analyzer.save_model(model_path)
    
    # Check command mode
    if len(sys.argv) > 2:
        command = sys.argv[1]
        
        # Find similar emails
        if command == "--similar":
            email_content = sys.argv[2]
            count = int(sys.argv[3]) if len(sys.argv) > 3 else 3
            
            similar_emails = analyzer.get_similar_emails(email_content, top_n=count)
            print(json.dumps(similar_emails))
            
        # Learn from task data
        elif command == "--learn":
            task_data_json = sys.argv[2]
            try:
                task_data = json.loads(task_data_json)
                success = analyzer.learn_from_task(task_data)
                if success:
                    analyzer.save_model(model_path)
                    print(json.dumps({"success": True, "message": "Learned from task data"}))
                else:
                    print(json.dumps({"success": False, "message": "No useful data to learn from"}))
            except Exception as e:
                logger.error(f"Error learning from task: {e}")
                print(json.dumps({"error": f"Failed to learn from task data: {str(e)}"}))
                
        # Get learning stats
        elif command == "--stats":
            stats = analyzer.get_learning_stats()
            print(json.dumps(stats))
            
        # Extract entities
        elif command == "--entities":
            email_content = sys.argv[2]
            entities = analyzer.extract_entities(email_content)
            print(json.dumps(entities))
            
        else:
            print(json.dumps({"error": f"Unknown command: {command}"}))
    else:
        # Default: analyze and suggest template
        email_content = sys.argv[1]
        
        # Get sentiment
        sentiment = analyzer.analyze_sentiment(email_content)
        
        # Suggest template
        template_suggestion = analyzer.suggest_template(email_content)
        
        # Extract entities
        entities = analyzer.extract_entities(email_content)
        
        # Combine results
        result = {
            "sentiment": sentiment,
            "template": template_suggestion["template"],
            "variables": template_suggestion["variables"],
            "message": template_suggestion["message"],
            "entities": entities
        }
        # Add confidence score: 1 if variables/entities found, else 0.5
        has_vars = bool(template_suggestion["variables"]) or any(entities.values())
        result["confidence"] = 1.0 if has_vars else 0.5
        print(json.dumps(result))

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"Unhandled exception: {e}")
        print(json.dumps({"error": f"An unexpected error occurred: {str(e)}"}))
        sys.exit(1)