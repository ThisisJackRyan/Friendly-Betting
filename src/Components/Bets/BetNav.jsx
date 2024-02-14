import React from 'react';
import {useNavigate } from 'react-router-dom';
import css from './Bets.module.css';

const BetNav = (props) => {
    const navigate = useNavigate();

    const goToMoneyLine = () => {
        navigate('/Friendly-Betting/MoneyLineBets')
    }
    const goToOverUnder = () => {
        navigate('/Friendly-Betting/OverUnderBets')
    }
    const goToProps = () => {
        navigate('/Friendly-Betting/PropBets')
    }
  return (
    <div className={css.betNav}>
        <div className={css.x}><span onClick={props.swap} >x</span></div>
        <h1><span>Bets</span></h1>
        <div className={css.BettingLinks}>
            <div>
                <div onClick={goToMoneyLine} className={css.betNavLinks} >Money Line Bets</div>
            </div>
            <div>
                <div onClick={goToOverUnder} className={css.betNavLinks} >Over / Under Bets</div>
            </div>
            <div>
                <div onClick={goToProps} className={css.betNavLinks} >Prop Bets</div>
            </div>
        </div>
    </div>
  );
};

export default BetNav;
