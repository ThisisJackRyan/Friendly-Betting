import React, {useState} from 'react';
import {useNavigate } from 'react-router-dom';
import css from './Bets.module.css';
import { Link } from 'react-router-dom';

const BetNav = (props) => {

    const [betType, setBetType] = useState('MoneyLineBets')

    const navigate = useNavigate();

    const goTo = (bet) => {
        navigate(`/Friendly-Betting/${bet}`)

    }
  return (
    
    <div className='fixed h-full top-0 bottom-0 left-0 right-0 bg-spring-green-light'>
        <div className="flex justify-center ">
                <Link className=" ease-in no-underline text-black" to="Friendly-Betting/">
                    <div className="p-4 pt-8 text-shadow flex justify-start items-center text-5xl">
                        <span className="font-sans font-thin">FR</span>
                        <span className="font-serif font-bold text-2xl">IE</span>
                        <span className="font-sans font-thin">NDLY &nbsp;</span>
                        <span>Bets</span>
                    </div>
                </Link>
            </div>
        <div className='absolute top-0 right-0 mr-8 mt-8'>
             <div className="x text-2xl"><span onClick={props.swap} >x</span></div>
        </div>
        <div className='flex justify-center items-center h-full'>
            {/* Make this a drop down that displays description... look at meta's website */}
            <div className='flex justify-around my-8 ml-8 flex-col gap-8 text-nowrap'>
                <div className="cursor-pointer" onClick={() => goTo("MoneyLineBets")} onMouseEnter={() => {setBetType("MoneyLineBets")}}>
                    Money Line
                </div>
                <div className="cursor-pointer" onClick={() => goTo("OverUnderBets")} onMouseEnter={() => {setBetType("OverUnderBets")}}>
                    Over / Under
                </div>
                <div className="cursor-pointer" onClick={() => goTo("PropBets")} onMouseEnter={() => {setBetType("PropBets")}}> 
                    Prop (Not Implemented Yet)
                </div>
            </div>
        </div>
    </div>




    // <div className="fixed-center bg-spring-green-light text-black p-4 rounded-md black-border box-shadow-no-hover">
    //     <div className='flex justify-end ml-4'>
    //         <div className="x text-md"><span onClick={props.swap} >x</span></div>
    //     </div>
    //     <div className='flex justify-center'>
    //         <div className=' text-3xl'><span className='border-bottom'>Bets</span></div>      
    //     </div>
    //     <div className="flex">
    //         <div className='flex justify-around my-8 ml-8 flex-col gap-8 text-nowrap'>
    //             <div className="cursor-pointer" onClick={() => goTo("MoneyLineBets")} onMouseEnter={() => {setBetType("MoneyLineBets")}}>
    //                 Money Line
    //             </div>
    //             <div className="cursor-pointer" onClick={() => goTo("OverUnderBets")} onMouseEnter={() => {setBetType("OverUnderBets")}}>
    //                 Over / Under
    //             </div>
    //             <div className="cursor-pointer" onClick={() => goTo("PropBets")} onMouseEnter={() => {setBetType("PropBets")}}> 
    //                 Prop (Not Implemented Yet)
    //             </div>
    //         </div>
    //         <div className={`bg-secondary-spring-green-light rounded-md p-4 m-4 ml-24 max-h-96 ${css.betDescriptions}`}>
    //                 { 
    //                     betType === 'OverUnderBets' ? 
    //                         <span>
    //                             An over/under bet, also known as a totals bet, is a type of wager where you bet on the total 
    //                             combined score of both teams or participants in a game, match, or event. 
    //                             Rather than betting on the outcome of the game itself,
    //                             you're betting on whether the total score will be over or under a predetermined number set by the
    //                             sports book or betting operator.
    //                         </span>
    //                     : betType === 'PropBets' ? 
    //                         <span>
    //                             A prop bet, short for proposition bet, is a type of wager that focuses on specific occurrences or outcomes within a game, 
    //                             match, or event, rather than the overall result. 
    //                             These bets can be based on a wide range of scenarios, often unrelated to the final score or outcome of the event. 
    //                             Prop bets are popular in sports betting, but they can also be found in other contexts such as entertainment events, 
    //                             politics, and even financial markets
    //                         </span>
    //                     : 
    //                         <span>
    //                             Money Line bet is a type of wager where you place a bet on the outcome of an event with only two possible outcomes. 
    //                             It's commonly used in sports betting, but can also be applied to other contexts like political elections or entertainment events. 
    //                             In a Money line bet, you simply choose which side you think will win. The goal is to correctly predict the 
    //                             winner of the event to receive a payout based on the odds associated with your chosen outcome.
    //                         </span>
    //                 }
    //         </div>
    //     </div>
    // </div>
  );
};

export default BetNav;
