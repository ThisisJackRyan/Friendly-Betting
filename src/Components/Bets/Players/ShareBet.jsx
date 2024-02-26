import React from 'react';
import css from './Players.module.css';
import QRCode from 'react-qr-code';
import {useState} from 'react';





const ShareBet = (props) => {

    const [json,setJson] = useState({
        "friends": [
            
            {
               
            
                "name": "John",
                "email": "johnRyan@gmail.com",
                "phone": "1234567890"
                    
                
            },
            {
                
                "name": "Jack",
                "email": "JackRyan@gmail.com",
                "phone": "1234567890"
                    
                
            },
            {
                
                "name": "Another Person",
                "email": "Person@gmail.com",
                "phone": "1234567890"
                    
                
            }
            
        ]
    });

    

    const handleSubmit = (e) => {
        e.preventDefault();
        // Logic to share the bet
        console.log('Sharing bet');
    }



    
    return (
        <div className={css.shareBet}>
            <div className="flex justify-center mb-2"><span className={css.x} onClick={props.display}>x</span></div>
            <div className={css.friendsLabel}><span>friends</span></div>
            <form onSubmit={handleSubmit}>
            
            <QRCode
                title="qr-code"
                value={window.location.href}
                bgColor="#FFFFFF"
                fgcolor="#000000"
                size="254"
            />
                    <button type="submit">Send</button>
            </form>
        </div>
        
    );
};

export default ShareBet;
