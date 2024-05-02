import React, {useState} from 'react';
import {useNavigate } from 'react-router-dom';
import css from './Bets.module.css';
import { Link } from 'react-router-dom';
import { BsCaretDownFill, BsCaretUpFill} from "react-icons/bs";
import { CSSTransition } from 'react-transition-group';

const BetNav = (props) => {

    const [betType, setBetType] = useState('MoneyLineBets')

    const [isOpen, setIsOpen] = useState(false);

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
        <div className='flex justify-center items-start mt-40 h-full'>
            {/* Make this a drop down that displays description... look at meta's website */}
            <div className='flex justify-around my-8 ml-8 flex-col gap-8 text-nowrap'>
            {/* () => goTo("MoneyLineBets") */}
            <div className='cursor-pointer flex flex-col justify-center items-center w-full max-w-64'>

                <button className=" w-full flex justify-between items-center border-4 rounded-lg p-2 m-2 bg-secondary-spring-green-light    active:border-gray-50 duration-300 active:text-gray-50" onClick={() => setIsOpen(!isOpen)} onMouseEnter={() => {setBetType("MoneyLineBets")}}>
                    Money Line
                    <div className='flex justify-center items-center'>
                        {isOpen ? <BsCaretUpFill className='flex justify-center items-center' /> : <BsCaretDownFill className='lex justify-center items-center' />}
                    </div>
                </button>
                <CSSTransition
                    in={isOpen}
                    timeout={500}
                    classNames="createBet"
                    unmountOnExit              
                >
                    <div>
                        <div className='relative flex justify-center items-center  border-4 rounded-lg bg-secondary-spring-green-light'>
                            <span  className=' break-words whitespace-normal flex justify-center items-center p-2'>
                            Money Line bet is a type of wager where you place a bet on the outcome of an event with only two possible outcomes. 
                            In a Money line bet, you simply choose which side you think will win. 
                            </span>
                        </div>
                        <button className='flex justify-center w-full bg-blue-gray border-4 rounded-lg p-2 mb-64 text-white active:border-gray-50'>
                            <span>
                                Create One!
                            </span>
                        </button>
                    </div>
                </CSSTransition>

            </div>

                <div className="cursor-pointer  black-border rounded-md p-2 m-2" onClick={() => goTo("OverUnderBets")} onMouseEnter={() => {setBetType("OverUnderBets")}}>
                    Over / Under
                </div>
                <div className="cursor-pointer black-border rounded-md p-2 m-2" onClick={() => goTo("PropBets")} onMouseEnter={() => {setBetType("PropBets")}}> 
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
