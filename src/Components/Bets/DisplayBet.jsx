import React from 'react';
import css from './Bets.module.css';
import {Link} from 'react-router-dom';



const DisplayBet = (props) => {

    const viewBet = () => {
        if(props.bet.type === "Money Line"){
            console.log(props.bet.id);
        }
    }

    return (
        <div onClick={viewBet}>
            <Link 
                to="/Friendly-Betting/Bet/MoneyBets/"
                state={{"bet":props.bet}}
                className={css.link}
            
            >
                <div className={css.bet} key={props.bet.id}>
                    <h4>{props.bet.type}</h4>
                    <p>{props.bet.bet}</p>
                </div>
            </Link>
        </div>
    );
}

export default DisplayBet;