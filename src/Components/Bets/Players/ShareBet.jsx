import React from 'react';
import css from './Players.module.css';
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
                
                "name": "Matt",
                "email": "Wilson@gmail.com",
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
            <div className={css.x}><span onClick={props.display}>x</span></div>
            <div className={css.friendsLabel}><span>friends</span></div>
            <form onSubmit={handleSubmit}>
                {//props.friends.map((friend ) => (
                json["friends"].map((friend) => (
                    <label className={css.container}>
                        {friend.name}
                        <input className={css.input} type="checkbox" name="" id="" />
                        <span className={css.checkmark}></span>
                        
                    </label>
                ))}
                    <button type="submit">Send</button>
            </form>
        </div>
        
    );
};

export default ShareBet;
