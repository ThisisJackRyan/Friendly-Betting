import React from 'react';
import css from './Bets.module.css';
import {Link} from 'react-router-dom';



const DisplayBet = (props) => {

    const viewBet = () => {
        if(props.bet.type === "Money Line"){
            return "MoneyLineBets/"
        }
        else if(props.bet.type === "Over Under"){
            return "OverUnderBets/"
        }
        else if(props.bet.type === "Prop"){
            return "PropBets/"
        }
    }

    return (
        <div onClick={viewBet}>
            <Link 
                to={`/Friendly-Betting/Bet/${viewBet()}`}
                state={{"bet":props.bet}}x
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